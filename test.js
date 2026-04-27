const fs = require('fs');
const code = fs.readFileSync('articles.js', 'utf8');

// Mock DOM
const dom = {
  innerHTML: '',
  classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{} },
  addEventListener: ()=>{},
  querySelector: ()=>null,
  closest: ()=>null
};

global.document = {
  getElementById: () => dom,
  querySelector: () => dom,
  addEventListener: () => {},
  body: dom
};
global.window = {
  setInterval: () => {},
  requestAnimationFrame: () => {}
};
global.fetch = async () => ({
  ok: true,
  text: async () => fs.readFileSync('articles.json', 'utf8')
});

eval(code);

// Wait for fetch to complete
setTimeout(() => {
  console.log("Done");
}, 1000);
