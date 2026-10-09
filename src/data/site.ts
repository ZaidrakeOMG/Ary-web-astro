export const stations = [
  {
    "id": "ary-i",
    "name": "ARY Super Servicios I",
    "shortName": "ARY I",
    "city": "Gómez Palacio",
    "address": "Calle 5 de Mayo 740, Francisco González de la Vega, Gómez Palacio, Durango",
    "image": "ary-1",
    "number": "6953"
  },
  {
    "id": "ary-ii",
    "name": "ARY Super Servicios II",
    "shortName": "ARY II",
    "city": "Lerdo",
    "address": "Blvd. Miguel Alemán 1200 Nte., Centro, Ciudad Lerdo, Durango",
    "image": "ary-2",
    "number": "4376"
  },
  {
    "id": "ary-iii",
    "name": "ARY Super Servicios III",
    "shortName": "ARY III",
    "city": "Torreón",
    "address": "Av. Abasolo 1195, Centro, Torreón, Coahuila",
    "image": "ary-3",
    "number": "4837"
  },
  {
    "id": "ary-iv",
    "name": "ARY Super Servicios IV",
    "shortName": "ARY IV",
    "city": "Torreón",
    "address": "Blvd. Rodríguez Triana 888, Residencial Las Misiones, Torreón, Coahuila",
    "image": "ary-4",
    "number": "5522"
  },
  {
    "id": "ary-v",
    "name": "ARY Super Express V",
    "shortName": "ARY V",
    "city": "Lerdo",
    "address": "Blvd. Miguel Alemán 1207 Nte., Ciudad Lerdo, Durango",
    "image": "ary-5",
    "number": "9427"
  },
  {
    "id": "ary-vi",
    "name": "ARY Super Servicios VI",
    "shortName": "ARY VI",
    "city": "Torreón",
    "address": "Blvd. Centenario 450, Torreón, Coahuila",
    "image": "ary-6",
    "number": "11507"
  },
  {
    "id": "apache",
    "name": "Servicio Apache",
    "shortName": "Apache",
    "city": "Gómez Palacio",
    "address": "Libramiento Periférico Lerdo–Gómez Palacio–Torreón, Gómez Palacio, Durango",
    "image": "apache",
    "number": "6086"
  }
];
export type Station = typeof stations[number];
export const mapsLink = (address: string) => "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(address);
