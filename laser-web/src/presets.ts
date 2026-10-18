export interface MaterialPreset {
  id: string
  name: string
  category: 'Wood' | 'Leather' | 'Stone' | 'Acrylic' | 'Metal/Glass' | 'Custom'
  speed: number
  power: number
  description: string
  simBaseColor: string
  simBurnColor: string
}

export const DEFAULT_PRESETS: MaterialPreset[] = [
  { id: 'pine', name: 'Pine / Softwood', category: 'Wood', speed: 2500, power: 650, description: 'Dark high-contrast rustic burn', simBaseColor: '#deb887', simBurnColor: '#3d2314' },
  { id: 'basswood', name: 'Basswood Sheet', category: 'Wood', speed: 3000, power: 500, description: 'Clean engraving without heavy char', simBaseColor: '#f5deb3', simBurnColor: '#4a2e1b' },
  { id: 'hardwood', name: 'Walnut / Oak / Maple', category: 'Wood', speed: 2000, power: 750, description: 'Deep, crisp burn into dense grain', simBaseColor: '#c29b68', simBurnColor: '#2b170c' },
  { id: 'plywood', name: 'Birch Plywood', category: 'Wood', speed: 2800, power: 600, description: 'Surface etch avoiding glue layers', simBaseColor: '#e8d3b9', simBurnColor: '#452613' },
  { id: 'leather-veg', name: 'Veg-Tan Leather', category: 'Leather', speed: 3800, power: 350, description: 'Crisp surface caramelization', simBaseColor: '#c99661', simBurnColor: '#2e190b' },
  { id: 'leather-dark', name: 'Dark / Dyed Leather', category: 'Leather', speed: 4200, power: 300, description: 'Subtle debossed outline mark', simBaseColor: '#4a3328', simBurnColor: '#120b07' },
  { id: 'slate', name: 'Slate Coaster', category: 'Stone', speed: 1200, power: 900, description: 'Bright frosted white surface etch', simBaseColor: '#26292b', simBurnColor: '#ededed' },
  { id: 'ceramic-tile', name: 'Ceramic / Coated Tile', category: 'Stone', speed: 1000, power: 950, description: 'Permanent surface glaze etch', simBaseColor: '#d6d6d6', simBurnColor: '#1f1f1f' },
  { id: 'acrylic-black', name: 'Cast Dark Acrylic', category: 'Acrylic', speed: 1800, power: 450, description: 'Clean frosted surface engraving', simBaseColor: '#141416', simBurnColor: '#ffffff' },
  { id: 'metal-anodized', name: 'Anodized Aluminum', category: 'Metal/Glass', speed: 1500, power: 900, description: 'Ablates dye layer to bright white', simBaseColor: '#212124', simBurnColor: '#f0f0f2' },
  { id: 'metal-painted', name: 'Painted Stainless (Tumbler)', category: 'Metal/Glass', speed: 1400, power: 950, description: 'Strips paint to bare metal', simBaseColor: '#1c1c1e', simBurnColor: '#e1e1e6' }
]