const unpdf = require('unpdf');
console.log('extractText:', unpdf.extractText.toString().substring(0, 100));
console.log('extractPDFText:', unpdf.extractPDFText.toString().substring(0, 100));
