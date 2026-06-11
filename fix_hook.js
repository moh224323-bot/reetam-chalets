const fs = require('fs');
const path = '/Users/mohamdal-saleem/Desktop/chalet-app/src/app/index.tsx';
let c = fs.readFileSync(path, 'utf8');

// احذف السطر 92
c = c.replace(
  '\nfunction useIsMobile(){const {width}=useWindowDimensions();return width<768;}\n',
  '\n'
);

fs.writeFileSync(path, c);
console.log('done:', (c.match(/function useIsMobile/g)||[]).length, 'remaining');
