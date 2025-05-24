// backend/server.js
const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const { normInv } = require('./utils');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ELO_MEAN = 1500;
const ELO_STDDEV = 100;

app.post('/upload', upload.single('file'), async (req, res) => {
  const sessionUserId = req.headers['x-user-id'];
  if (!sessionUserId) return res.status(400).send('Missing user ID');

  const existingTitles = new Set();
  const { data: existingMovies, error } = await supabase
    .from('movies')
    .select('title')
    .eq('user_id', sessionUserId);

  if (error) {
    console.error('Error fetching existing movies:', error);
    return res.status(500).send('Error fetching existing movies');
  }

  existingMovies.forEach((movie) => existingTitles.add(movie.title));

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (row) => {
      const title = `${row['Name']} ${row['Year']}`;
      const rating = parseFloat(row['Your Rating'] || row['Rating']);
      const uri = row['Letterboxd URI'];
      if (title && uri && !isNaN(rating) && !existingTitles.has(title)) {
        results.push({ title, rating, uri });
      }
    })
    .on('end', async () => {
      fs.unlinkSync(req.file.path);

      if (results.length === 0) {
        return res.json([]); // no new movies to add
      }

      results.sort((a, b) => b.rating - a.rating);
      const n = results.length;
      const withElo = results.map((movie, i) => {
        const percentile = 1 - (i + 0.5) / n;
        const z = normInv(percentile);
        const elo = Math.round(ELO_MEAN + z * ELO_STDDEV);
        return { title: movie.title, rating: movie.rating, uri: movie.uri, elo };
      });

      const totalElo = withElo.reduce((sum, m) => sum + m.elo, 0);
      const meanElo = totalElo / withElo.length;
      const offset = Math.round(meanElo - ELO_MEAN);

      if (offset !== 0) {
        const { data: allUserMovies, error: fetchErr } = await supabase
          .from('movies')
          .select('id, elo')
          .eq('user_id', sessionUserId);

        if (!fetchErr && allUserMovies.length > 0) {
          const adjustments = allUserMovies.slice(0, withElo.length);
          const perMovieAdjustment = Math.round(offset / adjustments.length);

          for (const movie of adjustments) {
            const newElo = movie.elo - perMovieAdjustment;
            await supabase.from('movies').update({ elo: newElo }).eq('id', movie.id);
          }
        }
      }

      const toInsert = withElo.map((movie) => ({
        user_id: sessionUserId,
        title: movie.title,
        rating: movie.rating,
        elo: movie.elo,
        uri: movie.uri,
      }));

      const { error: insertError } = await supabase.from('movies').insert(toInsert);
      if (insertError) {
        console.error('Error inserting new movies:', insertError);
        return res.status(500).send('Insert error');
      }

      res.json(toInsert);
    });
});

app.listen(4000, () => console.log('Server running on http://localhost:4000'));