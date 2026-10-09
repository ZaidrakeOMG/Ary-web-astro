export interface Station {
  id: string;
  name: string;
  city: "Gómez Palacio" | "Lerdo" | "Torreón";
  address: string;
  image: string;
  shortName: string;
}

export const stations: Station[] = [
  {
    id: "ary-i",
    name: "ARY Super Servicios I",
    shortName: "ARY I",
    city: "Gómez Palacio",
    address: "Calle 5 de Mayo 740, Francisco González de la Vega, Gómez Palacio, Durango",
    image: "/Images/Ary-super-servicios-I.jpg",
  },
  {
    id: "ary-ii",
    name: "ARY Super Servicios II",
    shortName: "ARY II",
    city: "Lerdo",
    address: "Blvd. Miguel Alemán 1200 Nte., Centro, Ciudad Lerdo, Durango",
    image: "/Images/ubica_estaciones_de_servicio.jpg",
  },
  {
    id: "ary-iii",
    name: "ARY Super Servicios III",
    shortName: "ARY III",
    city: "Torreón",
    address: "Av. Abasolo 1195, Centro, Torreón, Coahuila",
    image: "/Images/Ary-super-servicios-III.jpg",
  },
  {
    id: "ary-iv",
    name: "ARY Super Servicios IV",
    shortName: "ARY IV",
    city: "Torreón",
    address: "Blvd. Rodríguez Triana 888, Residencial Las Misiones, Torreón, Coahuila",
    image: "/Images/ubica_estaciones_de_servicio.jpg",
  },
  {
    id: "ary-v",
    name: "ARY Super Express V",
    shortName: "ARY V",
    city: "Lerdo",
    address: "Blvd. Miguel Alemán 1207 Nte., Ciudad Lerdo, Durango",
    image: "/Images/ubica_estaciones_de_servicio.jpg",
  },
  {
    id: "ary-vi",
    name: "ARY Super Servicios VI",
    shortName: "ARY VI",
    city: "Torreón",
    address: "Blvd. Centenario 450, Torreón, Coahuila",
    image: "/Images/ubica_estaciones_de_servicio.jpg",
  },
  {
    id: "apache",
    name: "Servicio Apache",
    shortName: "Apache",
    city: "Gómez Palacio",
    address: "Libramiento Periférico Lerdo–Gómez Palacio–Torreón, Gómez Palacio, Durango",
    image: "/Images/imagen-estacion-apache.png",
  },
];

export function mapsLink(address: string) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
}

export const quickServices = [
  {
    number: "01",
    title: "Control de flotillas",
    description: "Conoce nuestras alternativas para organizar y administrar consumos de vehículos empresariales.",
    href: "/servicios/",
    icon: "◈",
  },
  {
    number: "02",
    title: "Tarjeta ARY",
    description: "Opciones de control para empresas y clientes que buscan mayor comodidad en su operación.",
    href: "/servicios/",
    icon: "▣",
  },
  {
    number: "03",
    title: "Facturación",
    description: "Registra tus datos fiscales, solicita tus facturas y consulta el seguimiento de tu trámite.",
    href: "/facturacion/",
    icon: "▤",
  },
  {
    number: "04",
    title: "Estaciones cerca de ti",
    description: "Encuentra las ubicaciones de ARY y Apache en la Comarca Lagunera.",
    href: "/estaciones/",
    icon: "⌖",
  },
];

export const tips = [
  {
    title: "Conduce con suavidad",
    summary: "Acelera y frena de forma gradual. Anticipar el tráfico puede ayudarte a evitar consumos innecesarios.",
    image: "/Images/tip-saving-fuel-smooth-drive.jpg",
    alt: "Conducción de automóvil en carretera",
    tag: "Conducción",
  },
  {
    title: "Revisa la presión de tus llantas",
    summary: "Comprueba la presión en frío y ajústala según lo recomendado por el fabricante de tu vehículo.",
    image: "/Images/tip-saving-check-tire-pressure.jpg",
    alt: "Revisión de la presión de las llantas",
    tag: "Mantenimiento",
  },
  {
    title: "Mantén tu motor al día",
    summary: "Respeta los servicios y utiliza los productos de mantenimiento especificados para tu automóvil.",
    image: "/Images/tip-saving-fuel-engine-tunning.jpg",
    alt: "Personal de servicio revisando un motor",
    tag: "Mantenimiento",
  },
  {
    title: "Verifica la tapa del tanque",
    summary: "Después de cargar, asegúrate de que la tapa del depósito de combustible quede bien cerrada.",
    image: "/Images/tip-saving-fuel-check-fuel-cap.jpg",
    alt: "Tapa de combustible de un automóvil",
    tag: "Revisión",
  },
  {
    title: "Mantén un ritmo constante",
    summary: "Cuando las condiciones de seguridad lo permitan, evita cambios bruscos de velocidad en carretera.",
    image: "/Images/tip-saving-fuel-use-cruise-drive.jpg",
    alt: "Automóvil circulando por carretera",
    tag: "Carretera",
  },
  {
    title: "Organiza tus recorridos",
    summary: "Agrupa tus pendientes en un solo viaje y evita transportar peso que no necesitas.",
    image: "/Images/tip-saving-fuel.jpg",
    alt: "Viaje por carretera",
    tag: "Planificación",
  },
];
