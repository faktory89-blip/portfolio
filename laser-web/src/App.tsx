import React, { useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'
import { 
  Play, Crosshair, AlertOctagon, UploadCloud, Usb, Sliders, 
  PlusCircle, Clock, RotateCcw, Grid, Eye, Image as ImageIcon, Flame,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, Target, Unlock
} from 'lucide-react'

interface MaterialPreset {
  id: string
  name: string
  category: 'Wood' | 'Leather' | 'Stone' | 'Acrylic' | 'Metal/Glass' | 'Custom'
  speed: number
  power: number
  description: string
  simBaseColor: string
  simBurnColor: string
}

const DEFAULT_PRESETS: MaterialPreset[] = [
  { id: 'pine', name: 'Pine / Softwood', category: 'Wood', speed: 2500, power: 650, description: 'Dark rustic burn', simBaseColor: '#deb887', simBurnColor: '#3d2314' },
  { id: 'basswood', name: 'Basswood Sheet', category: 'Wood', speed: 3000, power: 500, description: 'Clean engraving, minimal char', simBaseColor: '#f5deb3', simBurnColor: '#4a2e1b' },
  { id: 'hardwood', name: 'Walnut / Oak / Maple', category: 'Wood', speed: 2000, power: 750, description: 'Deep, crisp burn', simBaseColor: '#c29b68', simBurnColor: '#2b170c' },
  { id: 'plywood', name: 'Birch Plywood', category: 'Wood', speed: 2800, power: 600, description: 'Surface etch avoiding glue', simBaseColor: '#e8d3b9', simBurnColor: '#452613' },
  { id: 'leather-veg', name: 'Veg-Tan Leather', category: 'Leather', speed: 3800, power: 350, description: 'Caramelized burn', simBaseColor: '#c99661', simBurnColor: '#2e190b' },
  { id: 'slate', name: 'Slate Coaster', category: 'Stone', speed: 1200, power: 900, description: 'Frosted white surface etch', simBaseColor: '#26292b', simBurnColor: '#ededed' },
  { id: 'ceramic-tile', name: 'Coated Ceramic Tile', category: 'Stone', speed: 1000, power: 950, description: 'Permanent surface glaze etch', simBaseColor: '#d6d6d6', simBurnColor: '#1f1f1f' },
  { id: 'acrylic-black', name: 'Cast Dark Acrylic', category: 'Acrylic', speed: 1800, power: 450, description: 'Clean frosted surface engraving', simBaseColor: '#141416', simBurnColor: '#ffffff' },
  { id: 'metal-anodized', name: 'Anodized Aluminum', category: 'Metal/Glass', speed: 1500, power: 900, description: 'Ablates dye layer to bright white', simBaseColor: '#212124', simBurnColor: '#f0f0f2' },
  { id: 'metal-painted', name: 'Painted Stainless Tumbler', category: 'Metal/Glass', speed: 1400, power: 950, description: 'Strips paint to bare metal', simBaseColor: '#1c1c1e', simBurnColor: '#e1e1e6' }
]

type PreviewMode = 'original' | 'laser' | 'simulated'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null)
  const rawImageElement = useRef<HTMLImageElement | null>(null)

  const [presets, setPresets] = useState<MaterialPreset[]>(DEFAULT_PRESETS)
  const [selectedPreset, setSelectedPreset] = useState<MaterialPreset>(DEFAULT_PRESETS[0])
  const [customSpeed, setCustomSpeed] = useState(2500)
  const [customPower, setCustomPower] = useState(650)
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('laser')
  const [jogStep, setJogStep] = useState<number>(10)

  const [hasImage, setHasImage] = useState(false)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [threshold, setThreshold] = useState(128)
  const [useThreshold, setUseThreshold] = useState(false)
  const [invert, setInvert] = useState(false)

  // Serial & Acknowledgment Queue
  const [writer, setWriter] = useState<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const [connected, setConnected] = useState(false)
  const okResolvers = useRef<(() => void)[]>([])

  // Execution & Progress State
  const [isBurning, setIsBurning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentLine, setCurrentLine] = useState(0)
  const [totalLinesCount, setTotalLinesCount] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--')
  const [timeElapsed, setTimeElapsed] = useState<string>('00:00')
  const stopRequested = useRef(false)

  const BED_PX = 460
  const BED_MM = 400
  const SCALE = BED_PX / BED_MM

  useEffect(() => {
    if (!canvasRef.current) return
    const c = new fabric.Canvas(canvasRef.current, {
      width: BED_PX,
      height: BED_PX,
      backgroundColor: '#18181b',
      selection: true,
      imageSmoothingEnabled: false,
      enableRetinaScaling: true
    })
    setCanvas(c)
    return () => { c.dispose() }
  }, [])

  const hexToRgb = (hex: string) => {
    const clean = (hex || '#deb887').replace('#', '')
    const num = parseInt(clean, 16)
    if (isNaN(num)) return { r: 222, g: 184, b: 135 }
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
  }

  const formatDuration = (sec: number): string => {
    if (isNaN(sec) || sec < 0) return '00:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const applyImageFilters = () => {
    if (!canvas || !rawImageElement.current) return
    const activeObj = canvas.getObjects().find(o => o instanceof fabric.Image) as fabric.Image
    if (!activeObj) return

    const img = rawImageElement.current
    if (previewMode === 'original') {
      canvas.backgroundColor = '#18181b'
      activeObj.setElement(img)
      canvas.renderAll()
      return
    }

    const offCanvas = document.createElement('canvas')
    offCanvas.width = img.width
    offCanvas.height = img.height
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    const imgData = ctx.getImageData(0, 0, offCanvas.width, offCanvas.height)
    const d = imgData.data

    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))
    const baseColor = hexToRgb(selectedPreset.simBaseColor)
    const burnColor = hexToRgb(selectedPreset.simBurnColor)

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      gray = gray + brightness
      gray = contrastFactor * (gray - 128) + 128
      gray = Math.max(0, Math.min(255, gray))

      if (useThreshold) gray = gray >= threshold ? 255 : 0
      if (invert) gray = 255 - gray

      if (previewMode === 'simulated') {
        const factor = (255 - gray) / 255
        d[i] = Math.round(baseColor.r * (1 - factor) + burnColor.r * factor)
        d[i + 1] = Math.round(baseColor.g * (1 - factor) + burnColor.g * factor)
        d[i + 2] = Math.round(baseColor.b * (1 - factor) + burnColor.b * factor)
      } else {
        d[i] = gray
        d[i + 1] = gray
        d[i + 2] = gray
      }
    }

    ctx.putImageData(imgData, 0, 0)
    const updated = new Image()
    updated.src = offCanvas.toDataURL()
    updated.onload = () => {
      canvas.backgroundColor = previewMode === 'simulated' ? selectedPreset.simBaseColor : '#18181b'
      activeObj.setElement(updated)
      canvas.renderAll()
    }
  }

  useEffect(() => {
    if (hasImage) applyImageFilters()
  }, [brightness, contrast, threshold, useThreshold, invert, previewMode, selectedPreset])

  const handleResetFilters = () => {
    setBrightness(0)
    setContrast(0)
    setThreshold(128)
    setUseThreshold(false)
    setInvert(false)
    setPreviewMode('laser')
  }

  // --- Serial Pipeline with Flow Control ---
  const sendCommand = async (cmd: string) => {
    if (!writer) return
    try {
      const payload = new TextEncoder().encode(cmd.trim() + '\r\n')
      await writer.write(payload)
    } catch (err: any) {
      console.error('Serial transmit error:', err)
    }
  }

  const sendAndWaitOk = (cmd: string): Promise<void> => {
    return new Promise(async (resolve) => {
      if (!writer) return resolve()
      okResolvers.current.push(resolve)
      const payload = new TextEncoder().encode(cmd.trim() + '\r\n')
      await writer.write(payload)

      // Fallback timer prevents deadlock if a packet drops
      setTimeout(() => {
        const idx = okResolvers.current.indexOf(resolve)
        if (idx !== -1) {
          okResolvers.current.splice(idx, 1)
          resolve()
        }
      }, 4000)
    })
  }

  const startReaderLoop = async (port: any) => {
    const textDecoder = new TextDecoderStream()
    port.readable.pipeTo(textDecoder.writable)
    const reader = textDecoder.readable.getReader()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          const lines = buffer.split('\r\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed === 'ok' || trimmed.startsWith('error:') || trimmed.startsWith('ALARM:')) {
              const resolveNext = okResolvers.current.shift()
              if (resolveNext) resolveNext()
            }
          }
        }
      }
    } catch (err) {
      console.error('Reader loop terminated:', err)
    }
  }

  const handleConnect = async () => {
    if (!('serial' in navigator)) return alert('Web Serial requires Chrome or Edge.')
    try {
      const port = await (navigator as any).serial.requestPort()
      await port.open({ 
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      })

      const w = port.writable.getWriter()
      setWriter(w)
      setConnected(true)

      startReaderLoop(port)

      // Wake GRBL, release boot locks ($X), and enable Laser Mode ($32=1)
      setTimeout(async () => {
        try {
          await w.write(new TextEncoder().encode('\r\n\r\n'))
          await w.write(new TextEncoder().encode('$X\r\n'))
          await w.write(new TextEncoder().encode('$32=1\r\n'))
        } catch (e) {
          console.error('Wakeup failed:', e)
        }
      }, 1500)
    } catch (err: any) {
      alert(`Serial connection failed: ${err.message}`)
    }
  }

  const handleUnlock = async () => {
    if (!connected) return alert('Connect via USB first.')
    await sendCommand('$X')
  }

  const handleJog = async (axis: 'X' | 'Y', direction: 1 | -1) => {
    if (!connected) return alert('Connect via USB first.')
    const dist = jogStep * direction
    await sendCommand(`$J=G91 G21 ${axis}${dist} F2000`)
  }

  const handleHome = async () => {
    if (!connected) return alert('Connect via USB first.')
    if (confirm('Run machine homing cycle ($H)?')) {
      await sendCommand('$H')
    }
  }

  const handleSetZero = async () => {
    if (!connected) return alert('Connect via USB first.')
    await sendCommand('G92 X0 Y0')
    alert('Current position set to (0,0) Origin.')
  }

  const handleTestPrint = async () => {
    if (!connected) return alert('Connect via USB first.')
    if (!confirm('Run 4x4 material test matrix from current position?')) return

    setIsBurning(true)
    setProgress(0)
    stopRequested.current = false

    const speeds = [1500, 2500, 3500, 4500]
    const powers = [300, 500, 700, 900]
    const boxSize = 6
    const gap = 2

    try {
      await sendAndWaitOk('$X')
      await sendAndWaitOk('G21 G91')
      await sendAndWaitOk('M4')
      const totalBoxes = speeds.length * powers.length
      let completed = 0

      for (let sIdx = 0; sIdx < speeds.length; sIdx++) {
        for (let pIdx = 0; pIdx < powers.length; pIdx++) {
          if (stopRequested.current) break
          const lines = Math.floor(boxSize / 0.2)
          for (let l = 0; l <= lines; l++) {
            if (stopRequested.current) break
            const dir = l % 2 === 0 ? 1 : -1
            await sendAndWaitOk(`G1 X${boxSize * dir} F${speeds[sIdx]} S${powers[pIdx]}`)
            if (l < lines) await sendAndWaitOk('G0 Y0.2')
          }
          await sendAndWaitOk('M5')
          completed++
          setProgress(Math.round((completed / totalBoxes) * 100))
          await sendAndWaitOk(`G0 X${gap} Y-${(lines * 0.2).toFixed(2)}`)
        }
        await sendAndWaitOk(`G0 X-${(boxSize + gap) * powers.length} Y${boxSize + gap}`)
      }
      await sendAndWaitOk('G90')
      await sendAndWaitOk('M5')
      if (!stopRequested.current) alert('Test pattern complete!')
    } catch (err: any) {
      alert(`Interrupted: ${err.message}`)
    } finally {
      setIsBurning(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !canvas) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const imgObj = new Image()
      imgObj.src = event.target?.result as string
      imgObj.onload = () => {
        rawImageElement.current = imgObj
        const scale = Math.min((BED_PX * 0.75) / imgObj.width, (BED_PX * 0.75) / imgObj.height, 1)

        const fabricImg = new fabric.Image(imgObj, {
          left: (BED_PX - imgObj.width * scale) / 2,
          top: (BED_PX - imgObj.height * scale) / 2,
          scaleX: scale,
          scaleY: scale,
          strokeUniform: true,
          noScaleCache: false
        })

        canvas.clear()
        canvas.backgroundColor = '#18181b'
        canvas.add(fabricImg)
        canvas.setActiveObject(fabricImg)
        canvas.renderAll()
        setHasImage(true)
        handleResetFilters()
      }
    }
    reader.readAsDataURL(file)
  }

  const handleFrame = async () => {
    if (!canvas) return
    const activeObj = canvas.getActiveObject()
    if (!activeObj) return alert('Click on your design to select it first.')
    if (!connected) return alert('Connect via USB first.')

    const bound = activeObj.getBoundingRect()
    const xMin = Math.max(0, bound.left / SCALE).toFixed(2)
    const yMin = Math.max(0, (BED_PX - (bound.top + bound.height)) / SCALE).toFixed(2)
    const xMax = Math.max(0, (bound.left + bound.width) / SCALE).toFixed(2)
    const yMax = Math.max(0, (BED_PX - bound.top) / SCALE).toFixed(2)

    await sendAndWaitOk('$X')
    await sendAndWaitOk('G21 G90')
    await sendAndWaitOk('M3 S5') // Low-power guide beam
    await sendAndWaitOk(`G0 X${xMin} Y${yMin} F2500`)
    await sendAndWaitOk(`G1 X${xMax} Y${yMin}`)
    await sendAndWaitOk(`G1 X${xMax} Y${yMax}`)
    await sendAndWaitOk(`G1 X${xMin} Y${yMax}`)
    await sendAndWaitOk(`G1 X${xMin} Y${yMin}`)
    await sendAndWaitOk('M5')
    await sendAndWaitOk('G0 X0 Y0 F2500')
  }

  const handleBurn = async () => {
    if (!canvas) return
    const activeObj = canvas.getActiveObject()
    if (!activeObj) return alert('Click on your design to select it first.')
    if (!connected) return alert('Connect via USB first.')

    const runSpeed = isCustomMode ? customSpeed : selectedPreset.speed
    const runPower = isCustomMode ? customPower : selectedPreset.power

    stopRequested.current = false
    setIsBurning(true)
    setProgress(0)

    try {
      await sendAndWaitOk('$X')
      await sendAndWaitOk('G21')
      await sendAndWaitOk('G90')

      const bound = activeObj.getBoundingRect()
      const originX = Math.max(0, bound.left / SCALE)
      const originY = Math.max(0, (BED_PX - (bound.top + bound.height)) / SCALE)
      const widthMM = bound.width / SCALE
      const heightMM = bound.height / SCALE

      const lineInterval = 0.2
      const totalLines = Math.floor(heightMM / lineInterval)
      setTotalLinesCount(totalLines)

      const lineTime = (widthMM / runSpeed) * 60 + 0.15
      const totalEstimated = lineTime * totalLines
      const startTime = Date.now()

      // Rapid move to the start point before turning laser on
      await sendAndWaitOk(`G0 X${originX.toFixed(2)} Y${originY.toFixed(2)} F2500`)
      await sendAndWaitOk('M4')

      for (let i = 0; i <= totalLines; i++) {
        if (stopRequested.current) break
        const currentY = (originY + i * lineInterval).toFixed(2)
        const forward = i % 2 === 0
        const fromX = forward ? originX.toFixed(2) : (originX + widthMM).toFixed(2)
        const toX = forward ? (originX + widthMM).toFixed(2) : originX.toFixed(2)

        await sendAndWaitOk(`G0 X${fromX} Y${currentY}`)
        await sendAndWaitOk(`G1 X${toX} Y${currentY} F${runSpeed} S${runPower}`)

        const elapsed = (Date.now() - startTime) / 1000
        setCurrentLine(i)
        setProgress(Math.round((i / totalLines) * 100))
        setTimeElapsed(formatDuration(elapsed))
        setTimeRemaining(formatDuration(Math.max(0, totalEstimated - elapsed)))
      }

      await sendAndWaitOk('M5')
      await sendAndWaitOk('G0 X0 Y0 F2500')
      if (!stopRequested.current) alert('Engraving complete!')
    } catch (err: any) {
      alert(`Error during engrave: ${err.message}`)
    } finally {
      setIsBurning(false)
    }
  }

  const handleEStop = async () => {
    stopRequested.current = true
    okResolvers.current = []
    if (writer) {
      await writer.write(new Uint8Array([0x18])) // Real-time GRBL soft reset
      await sendCommand('M5')
    }
    setIsBurning(false)
    alert('Laser halted.')
  }

  const handleSaveCustom = () => {
    const name = prompt('Name for this custom preset:')
    if (!name) return
    const newPreset: MaterialPreset = {
      id: `custom-${Date.now()}`,
      name,
      category: 'Custom',
      speed: customSpeed,
      power: customPower,
      description: 'Custom material parameter set',
      simBaseColor: '#deb887',
      simBurnColor: '#3d2314'
    }
    const updated = [newPreset, ...presets]
    setPresets(updated)
    setSelectedPreset(newPreset)
    setIsCustomMode(false)
  }

  const categories = ['All', 'Wood', 'Leather', 'Stone', 'Acrylic', 'Metal/Glass', 'Custom']
  const filteredPresets = activeCategory === 'All' ? presets : presets.filter(p => p.category === activeCategory)

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#09090b', color: '#f4f4f5', fontFamily: 'sans-serif' }}>
      {/* Sidebar: Presets */}
      <aside style={{ width: '340px', borderRight: '1px solid #27272a', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a1a1aa' }}>
              Material Library
            </h2>
            <button
              onClick={() => setIsCustomMode(!isCustomMode)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: isCustomMode ? '#10b981' : '#27272a', color: isCustomMode ? '#000' : '#a1a1aa', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              <Sliders size={12} />
              {isCustomMode ? 'Using Sliders' : 'Manual Sliders'}
            </button>
          </div>

          {!isCustomMode && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '12px' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    fontSize: '11px',
                    background: activeCategory === cat ? '#27272a' : 'transparent',
                    color: activeCategory === cat ? '#10b981' : '#71717a',
                    border: '1px solid #27272a',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {isCustomMode ? (
            <div style={{ background: '#18181b', border: '1px solid #10b981', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', display: 'block', marginBottom: '12px' }}>
                Manual Tuning
              </span>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: '#a1a1aa' }}>Speed</span>
                  <span style={{ fontFamily: 'monospace', color: '#fff' }}>{customSpeed} mm/min</span>
                </div>
                <input type="range" min="200" max="6000" step="50" value={customSpeed} onChange={e => setCustomSpeed(Number(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: '#a1a1aa' }}>Laser Power</span>
                  <span style={{ fontFamily: 'monospace', color: '#fff' }}>{(customPower / 10).toFixed(0)}% (S{customPower})</span>
                </div>
                <input type="range" min="50" max="1000" step="10" value={customPower} onChange={e => setCustomPower(Number(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} />
              </div>
              <button
                onClick={handleSaveCustom}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#27272a', color: '#f4f4f5', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              >
                <PlusCircle size={14} color="#10b981" /> Save as Preset Card
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 210px)', overflowY: 'auto' }}>
              {filteredPresets.map(m => (
                <div
                  key={m.id}
                  onClick={() => { setSelectedPreset(m); setIsCustomMode(false); }}
                  style={{
                    background: selectedPreset.id === m.id && !isCustomMode ? 'rgba(16, 185, 129, 0.1)' : '#18181b',
                    border: selectedPreset.id === m.id && !isCustomMode ? '1px solid #10b981' : '1px solid #27272a',
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{m.name}</span>
                    <span style={{ fontSize: '9px', background: '#27272a', padding: '2px 6px', borderRadius: '8px', color: '#a1a1aa' }}>{m.category}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#71717a', marginBottom: '6px' }}>{m.description}</p>
                  <div style={{ fontSize: '10px', color: '#a1a1aa', fontFamily: 'monospace' }}>
                    Speed: {m.speed} mm/m • Power: {(m.power / 10).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #27272a', paddingTop: '14px', marginTop: '10px' }}>
          <button
            onClick={handleConnect}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              background: connected ? '#059669' : '#27272a',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Usb size={16} />
            {connected ? 'Laser Linked' : 'Connect via USB'}
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#09090b', padding: '16px' }}>
        {hasImage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '10px 16px', marginBottom: '12px', maxWidth: '680px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setPreviewMode('original')}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: 'none', background: previewMode === 'original' ? '#3f3f46' : '#27272a', color: previewMode === 'original' ? '#fff' : '#a1a1aa', fontWeight: 600, cursor: 'pointer' }}
                >
                  <ImageIcon size={13} /> Original
                </button>
                <button
                  onClick={() => setPreviewMode('laser')}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: 'none', background: previewMode === 'laser' ? '#10b981' : '#27272a', color: previewMode === 'laser' ? '#000' : '#a1a1aa', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Eye size={13} /> Laser Print View
                </button>
                <button
                  onClick={() => setPreviewMode('simulated')}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: 'none', background: previewMode === 'simulated' ? '#f59e0b' : '#27272a', color: previewMode === 'simulated' ? '#000' : '#a1a1aa', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Flame size={13} /> Simulated Burn
                </button>
              </div>
              <button onClick={handleResetFilters} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <RotateCcw size={12} /> Reset
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingTop: '4px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#a1a1aa', marginBottom: '2px' }}>
                  <span>Bright</span>
                  <span>{brightness}</span>
                </div>
                <input type="range" min="-100" max="100" value={brightness} onChange={e => setBrightness(Number(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#a1a1aa', marginBottom: '2px' }}>
                  <span>Contrast</span>
                  <span>{contrast}</span>
                </div>
                <input type="range" min="-100" max="100" value={contrast} onChange={e => setContrast(Number(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: useThreshold ? '#10b981' : '#71717a', marginBottom: '2px' }}>
                  <span onClick={() => setUseThreshold(!useThreshold)} style={{ cursor: 'pointer', textDecoration: useThreshold ? 'underline' : 'none' }}>
                    {useThreshold ? 'B&W Mode' : 'Grayscale'}
                  </span>
                  <span>{threshold}</span>
                </div>
                <input type="range" min="0" max="255" disabled={!useThreshold} value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: '100%', accentColor: '#10b981', opacity: useThreshold ? 1 : 0.4 }} />
              </div>
              <button onClick={() => setInvert(!invert)} style={{ fontSize: '10px', background: invert ? '#10b981' : '#27272a', color: invert ? '#000' : '#a1a1aa', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                Invert
              </button>
            </div>
          </div>
        )}

        <div style={{ border: '2px solid #27272a', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
          <canvas ref={canvasRef} />
          <div style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '10px', fontFamily: 'monospace', color: '#71717a', background: 'rgba(9, 9, 11, 0.8)', padding: '3px 6px', borderRadius: '4px' }}>
            Bed: 400 × 400 mm
          </div>
          {previewMode === 'simulated' && (
            <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 600, color: '#f59e0b', background: 'rgba(9, 9, 11, 0.85)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
              Simulated: {selectedPreset.name}
            </div>
          )}
        </div>

        <label style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', background: '#18181b', border: '1px solid #27272a', padding: '10px 18px', borderRadius: '12px' }}>
          <UploadCloud size={16} color="#10b981" />
          <span>{hasImage ? 'Replace Image / Design' : 'Upload Image / Design'}</span>
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
        </label>
      </main>

      {/* Control Panel: Motion & Execution */}
      <aside style={{ width: '310px', borderLeft: '1px solid #27272a', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '8px' }}>
              Motion & Navigation
            </h2>
            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', width: '100%', marginBottom: '4px' }}>
                {[1, 10, 50].map(s => (
                  <button
                    key={s}
                    onClick={() => setJogStep(s)}
                    style={{ flex: 1, fontSize: '10px', padding: '4px', background: jogStep === s ? '#10b981' : '#27272a', color: jogStep === s ? '#000' : '#a1a1aa', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {s} mm
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gridTemplateRows: 'repeat(3, 40px)', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                <div />
                <button onClick={() => handleJog('Y', 1)} style={{ background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: '100%' }}>
                  <ArrowUp size={16} />
                </button>
                <div />
                <button onClick={() => handleJog('X', -1)} style={{ background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: '100%' }}>
                  <ArrowLeft size={16} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#71717a', fontFamily: 'monospace' }}>JOG</div>
                <button onClick={() => handleJog('X', 1)} style={{ background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: '100%' }}>
                  <ArrowRight size={16} />
                </button>
                <div />
                <button onClick={() => handleJog('Y', -1)} style={{ background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: '100%' }}>
                  <ArrowDown size={16} />
                </button>
                <div />
              </div>

              <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: '6px' }}>
                <button onClick={handleHome} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 2px', fontSize: '10px', cursor: 'pointer' }}>
                  <Home size={12} color="#10b981" /> Home ($H)
                </button>
                <button onClick={handleUnlock} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 2px', fontSize: '10px', cursor: 'pointer' }}>
                  <Unlock size={12} color="#f59e0b" /> Unlock ($X)
                </button>
                <button onClick={handleSetZero} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 2px', fontSize: '10px', cursor: 'pointer' }}>
                  <Target size={12} color="#10b981" /> Zero
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleTestPrint}
            disabled={isBurning}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#18181b', border: '1px solid #3f3f46', color: '#10b981', borderRadius: '10px', fontWeight: 600, fontSize: '12px', cursor: isBurning ? 'not-allowed' : 'pointer' }}
          >
            <Grid size={15} /> Burn 4x4 Material Test Matrix
          </button>

          <div>
            <h2 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '6px' }}>
              Execution
            </h2>
            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '10px', fontSize: '11px', marginBottom: '10px' }}>
              <span style={{ color: '#71717a', display: 'block' }}>Target:</span>
              <span style={{ fontWeight: 600, color: '#10b981' }}>{isCustomMode ? 'Manual Sliders' : selectedPreset.name}</span>
              <div style={{ fontFamily: 'monospace', color: '#a1a1aa', marginTop: '2px' }}>
                {isCustomMode ? customSpeed : selectedPreset.speed} mm/m @ {(((isCustomMode ? customPower : selectedPreset.power) / 10)).toFixed(0)}%
              </div>
            </div>

            {isBurning && (
              <div style={{ background: '#18181b', border: '1px solid #10b981', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} /> Active
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{progress}%</span>
                </div>
                <div style={{ width: '100%', background: '#27272a', borderRadius: '9999px', height: '6px', overflow: 'hidden' }}>
                  <div style={{ background: '#10b981', height: '100%', width: `${progress}%`, transition: 'width 0.15s ease' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', borderTop: '1px solid #27272a', paddingTop: '6px' }}>
                  <div>
                    <span style={{ fontSize: '9px', color: '#71717a', display: 'block' }}>Remaining</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#f4f4f5' }}>{timeRemaining}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', color: '#71717a', display: 'block' }}>Elapsed</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#a1a1aa' }}>{timeElapsed}</span>
                  </div>
                </div>
                <div style={{ fontSize: '9px', color: '#71717a', fontFamily: 'monospace', textAlign: 'center' }}>
                  Raster Line: {currentLine} / {totalLinesCount}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleFrame}
                disabled={isBurning}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: '#18181b', border: '1px solid #27272a', color: isBurning ? '#52525b' : '#f4f4f5', borderRadius: '10px', fontWeight: 600, fontSize: '12px', cursor: isBurning ? 'not-allowed' : 'pointer' }}
              >
                <Crosshair size={15} color="#10b981" /> Trace Frame (Guide)
              </button>
              <button
                onClick={handleBurn}
                disabled={isBurning}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: isBurning ? '#27272a' : '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '12px', cursor: isBurning ? 'not-allowed' : 'pointer' }}
              >
                <Play size={15} /> {isBurning ? 'Engraving...' : 'Start Engrave'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '14px' }}>
          <button
            onClick={handleEStop}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
          >
            <AlertOctagon size={16} /> EMERGENCY STOP
          </button>
        </div>
      </aside>
    </div>
  )
}