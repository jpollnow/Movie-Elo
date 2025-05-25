// server.js
const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const ELO_MEAN = 1500;
const ELO_STDDEV = 100;

function normInv(p, mean = 0, stdDev = 1) {
  const a1 = -39.6968302866538,
    a2 = 220.946098424521,
    a3 = -275.928510446969,
    a4 = 138.357751867269,
    a5 = -30.6647980661472,
    a6 = 2.50662827745924;
  const b1 = -54.4760987982241,
    b2 = 161.585836858041,
    b3 = -155.698979859887,
    b4 = 66.8013118877197,
    b5 = -13.2806815528857;
  const c1 = -0.00778489400243029,
    c2 = -0.322396458041136,
    c3 = -2.40075827716184,
    c4 = -2.54973253934373,
    c5 = 4.37466414146497,
    c6 = 2.93816398269878;
  const d1 = 0.00778469570904146,
    d2 = 0.32246712907004,
    d3 = 2.445134137143,
    d4 = 3.75440866190742;
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;
  let retVal;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    retVal = (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    retVal = (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    retVal = -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  return mean + stdDev * retVal;
}

app.post('/upload', upload.single('file'), async (req, res) => {
  const results = [];
  const userId = req.headers['x-user-id'];

  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (row) => {
      const title = row['Name'] && row['Year'] ? `${row['Name']} ${row['Year']}` : null;
      const rating = parseFloat(row['Your Rating'] || row['Rating']);
      const uri = row['Letterboxd URI'] || null;
      if (title && !isNaN(rating)) {
        results.push({ title, rating, uri });
      }
    })
    .on('end', async () => {
      fs.unlinkSync(req.file.path);

      const existing = await supabase
        .from('movies')
        .select('title')
        .eq('user_id', userId);

      const newMovies = results.filter(
        (movie) => !existing.data.some((m) => m.title === movie.title)
      );
      
      newMovies.sort((a, b) => b.rating - a.rating);

      const n = newMovies.length;
      const withElo = newMovies.map((movie, i) => {
        const percentile = 1 - (i + 0.5) / n;
        const z = normInv(percentile);
        const elo = Math.round(ELO_MEAN + z * ELO_STDDEV);
        return {
          user_id: userId,
          title: movie.title,
          rating: movie.rating,
          elo,
          uri: movie.uri,
        };
      });

      const { error } = await supabase
        .from('movies')
        .upsert(withElo, { onConflict: ['user_id', 'title'] });

      if (error) {
        console.error('Error saving to Supabase:', error);
        return res.status(500).json({ error: 'Failed to save movies.' });
      }

      res.json(withElo);
    });
});

app.listen(4000, () => console.log('Server running on http://localhost:4000'));
