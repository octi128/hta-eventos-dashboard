// Experimentos propios: un solo link por anuncio y reparto 50/50 controlado por nosotros (no por Framer).
// Cada brazo apunta a una versión de la landing de Framer (framer_variant). El brazo se marca en la URL
// con hta_v=A|B, así el dashboard lo mide desde los mismos datos de Framer.
export const SITE = "https://eventos.highwaytradingacademy.com";

export const EXPERIMENTS = {
  hollywood: {
    key: "hollywood",
    name: "Hollywood",
    event: "hollywood",
    landing: "/hw/hollywood",
    arms: {
      A: { label: "Original", variant: "TWBcZNpC0" },
      B: { label: "Variante B", variant: "xC4TrKpso" },
    },
  },
  houston: {
    key: "houston",
    name: "Houston",
    event: "houston",
    landing: "/houston-new/houston",
    arms: {
      A: { label: "Original", variant: "EydMCY1m5" },
      B: { label: "Lab", variant: "zbodSNUpy" },
    },
  },
};
