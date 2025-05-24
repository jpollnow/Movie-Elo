const fs = require('fs');
const csv = require('csv-parser');
const { normInv } = require('./utils');

const ELO_MEAN = 1500;
const ELO_STDDEV = 350;

const movies = [];

fs.createReadStream('ratings.csv')
  .pipe(csv())
  .on('data', (row) => {
    const title = row['Name'];
    const rating = parseFloat(row['Your Rating'] || row['Rating']);
    if (!isNaN(rating)) {
      movies.push({ title, rating });
    }
  })
  .on('end', () => {
    console.log(`Parsed ${movies.length} rated movies.`);

    // Sort descending by rating
    movies.sort((a, b) => b.rating - a.rating);

    // Assign percentile-based Elo from normal distribution
    const n = movies.length;
    const withElo = movies.map((movie, i) => {
      const percentile = 1 - (i + 0.5) / n;
      const z = normInv(percentile);
      const elo = Math.round(ELO_MEAN + z * ELO_STDDEV);
      return {
        title: movie.title,
        rating: movie.rating,
        elo,
      };
    });

    fs.writeFileSync('movies-with-elo.json', JSON.stringify(withElo, null, 2));
    console.log('Initial Elo scores assigned and saved.');
  });