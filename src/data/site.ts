export type Station = {
  id: string;
  name: string;
  shortName: string;
  city: 'Gómez Palacio' | 'Lerdo' | 'Torreón';
  address: string;
  image: string;
  number: string;
};

export const stations: Station[] = [
  {id:'ary-i',name:'ARY Super Servicios I',shortName:'ARY I',city:'Gómez Palacio',address:'Calle 5 de Mayo 740, Francisco González de la Vega, Gómez Palacio, Dgo.',image:'/media/ary-1.webp',number:'01'},
  {id:'ary-ii',name:'ARY Super Servicios II',shortName:'ARY II',city:'Lerdo',address:'Blvd. Miguel Alemán 1200 Nte., Centro, Ciudad Lerdo, Dgo.',image:'/media/ary-2.webp',number:'02'},
  {id:'ary-iii',name:'ARY Super Servicios III',shortName:'ARY III',city:'Torreón',address:'Av. Abasolo 1195, Centro, Torreón, Coah.',image:'/media/ary-3.webp',number:'03'},
  {id:'ary-iv',name:'ARY Super Servicios IV',shortName:'ARY IV',city:'Torreón',address:'Blvd. Rodríguez Triana 888, Residencial Las Misiones, Torreón, Coah.',image:'/media/ary-4.webp',number:'04'},
  {id:'ary-v',name:'ARY Super Express V',shortName:'ARY V',city:'Lerdo',address:'Blvd. Miguel Alemán 1207 Nte., Ciudad Lerdo, Dgo.',image:'/media/ary-5.webp',number:'05'},
  {id:'ary-vi',name:'ARY Super Servicios VI',shortName:'ARY VI',city:'Torreón',address:'Blvd. Centenario 450, Torreón, Coah.',image:'/media/ary-6.webp',number:'06'},
  {id:'apache',name:'Servicio Apache',shortName:'Apache',city:'Gómez Palacio',address:'Libramiento Periférico Lerdo–Gómez Palacio–Torreón, Gómez Palacio, Dgo.',image:'/media/apache.webp',number:'07'},
];

export const services = [
  {id:'01',icon:'◈',title:'Control de flotillas',body:'Herramientas para organizar consumos y acompañar la operación de tu empresa.',href:'/servicios/'},
  {id:'02',icon:'▧',title:'Tarjeta ARY',body:'Una alternativa práctica para administrar las cargas de tus vehículos.',href:'/servicios/'},
  {id:'03',icon:'✦',title:'Facturación digital',body:'Factura tickets o solicita tu registro fiscal desde un mismo lugar.',href:'/facturacion/'},
  {id:'04',icon:'⌖',title:'Estaciones cerca de ti',body:'Encuentra ubicaciones en Gómez Palacio, Lerdo y Torreón.',href:'/estaciones/'},
];

export const tips = [
  {title:'Maneja con suavidad',text:'Evita aceleraciones y frenadas bruscas para conducir de forma más eficiente.',tag:'Conducción'},
  {title:'Revisa tus llantas',text:'Ajusta la presión en frío siguiendo las indicaciones del fabricante.',tag:'Mantenimiento'},
  {title:'Cuida tu motor',text:'Respeta los servicios preventivos y utiliza los lubricantes recomendados.',tag:'Cuidado'},
  {title:'Revisa el tapón',text:'Verifica que la tapa del depósito cierre bien después de cargar.',tag:'Seguridad'},
  {title:'Planea tus rutas',text:'Organiza tus recorridos y reduce traslados innecesarios.',tag:'Organización'},
  {title:'Viaja a ritmo estable',text:'En condiciones seguras, procura evitar cambios abruptos de velocidad.',tag:'Ahorro'},
];

export const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
