const mongoose = require('mongoose');
const Volantino = require('./models/Volantino');
const fetch = require('node-fetch');

mongoose.connect('mongodb://localhost:27017/volantinomix')
  .then(async () => {
    const volantini = await Volantino.find({ store: { $in: ['Decò Gourmet', 'Ipercoop'] } }).limit(2);
    console.log('Volantini trovati:', volantini.map(v => ({ id: v._id, store: v.store, pdfUrl: v.pdfUrl })));

    const response = await fetch('http://localhost:5000/api/pdfs/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flyerIds: volantini.map(v => v._id.toString()),
        includeAds: false,
        includeTOC: true
      })
    });

    const result = await response.json();
    console.log('Risultato merge:', result);

    mongoose.disconnect();
  })
  .catch(console.error);