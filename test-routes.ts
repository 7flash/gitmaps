import { discoverRoutes } from 'tradjs/server';

const routes = await discoverRoutes('./app');
console.log('Discovered routes:');
for (const route of routes) {
  if (route.type === 'page') {
    console.log(`  ${route.pattern} -> ${route.filePath}`);
    console.log(`    regex: ${route.regex.toString()}`);
    console.log(`    paramNames: ${route.paramNames.join(', ')}`);
  }
}