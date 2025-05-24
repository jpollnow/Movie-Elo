const fs = require('fs');
const csv = require('csv-parser');
const { normInv } = require('./utils');

const ELO_MEAN = 1500;
const ELO_STDDEV = 350;

const existingMovies = JSON.parse(fs.readFileSync('movies-with-elo.json'));
const existingTitles = new Set(existingMovies.map(m => m.title));

const newRatings = [];

fs.createReadStream('ratings.csv')
  .pipe(csv())
  .on('data', (row) => {
    const title = row['Name'];
    const rating = parseFloat(row['Your Rating'] || row['Rating']);
    if (!existingTitles.has(title) && !isNaN(rating)) {
      newRatings.push({ title, rating });
    }
  })
  .on('end', () => {
    if (newRatings.length === 0) {
      console.log('No new movies to add.');
      return;
    }

    // Sort descending by rating
    newRatings.sort((a, b) => b.rating - a.rating);

    const n = newRatings.length;

    // Generate Elo from percentiles
    const newMovies = newRatings.map((movie, i) => {
      const percentile = 1 - (i + 0.5) / n;
      const z = normInv(percentile);
      return { title: movie.title, rating: movie.rating, z };
    });

    // Normalize new z-scores to preserve average and stddev
    const zMean = newMovies.reduce((sum, m) => sum + m.z, 0) / n;
    const zStd = Math.sqrt(newMovies.reduce((sum, m) => sum + Math.pow(m.z - zMean, 2), 0) / n);

    newMovies.forEach(m => {
      const zNormalized = (m.z - zMean) / zStd;
      m.elo = Math.round(ELO_MEAN + zNormalized * ELO_STDDEV);
      delete m.z;
    });

    const updated = existingMovies.concat(newMovies);
    fs.writeFileSync('movies-with-elo.json', JSON.stringify(updated, null, 2));
    console.log(`Added ${newMovies.length} new movie(s). Elo average preserved.`);
  });