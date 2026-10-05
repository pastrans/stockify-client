const fs = require('fs');

// Ruta donde se generará el archivo para producción
const targetPath = './src/environments/environment.ts';

// Railway inyecta las variables en process.env
// Usamos un fallback a localhost por si lo corres sin variables
const apiUrl = process.env.API_URL || 'http://localhost:3001/api/v1';

const envConfigFile = `
// ==========================================================
// ⚠️ ARCHIVO GENERADO AUTOMÁTICAMENTE EN RAILWAY
// NO MODIFICAR ESTE ARCHIVO MANUALMENTE.
// ==========================================================

export const environment = {
  production: true,
  apiUrl: '${apiUrl}'
};
`;

// Escribimos el archivo físicamente
fs.writeFileSync(targetPath, envConfigFile, { encoding: 'utf8' });
console.log(`✅ environment.prod.ts generado con éxito usando la URL: ${apiUrl}`);