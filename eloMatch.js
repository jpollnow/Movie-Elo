const fs = require('fs');
const readline = require('readline');

// Settings
const K = 32;
const NUM_RECENT_MATCHUPS_TO_AVOID = 10;

let movies = JSON.parse(fs.readFileSync('movies-with-elo.json', 'utf-8'));
const recentMatchups = []; // Prevents repeats

function getRandomWeightedPair() {
  let pair;
  do {
    const a = movies[Math.floor(Math.random() * movies.length)];
    let candidates = movies.filter(b =>
      b.title !== a.title &&
      Math.abs(b.elo - a.elo) < 150 // Prefer similar Elo
    );

    if (candidates.length === 0) candidates = movies.filter(b => b.title !== a.title);
    const b = candidates[Math.floor(Math.random() * candidates.length)];

    const matchupKey = [a.title, b.title].sort().join(' vs ');
    if (!recentMatchups.includes(matchupKey)) {
      pair = [a, b];
      recentMatchups.push(matchupKey);
      if (recentMatchups.length > NUM_RECENT_MATCHUPS_TO_AVOID) recentMatchups.shift();
    }
  } while (!pair);

  return pair;
}

function calculateElo(winner, loser) {
  const expectedWin = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
  const expectedLoss = 1 - expectedWin;

  winner.elo = Math.round(winner.elo + K * (1 - expectedWin));
  loser.elo = Math.round(loser.elo + K * (0 - expectedLoss));
}

function promptUser([a, b]) {
  console.log('\nWhich movie is better?');
  console.log(`1: ${a.title}`);
  console.log(`2: ${b.title}`);
  console.log('q: Quit');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('\nYour choice (1/2/q): ', (answer) => {
    let winner, loser;

    if (answer === '1') {
      winner = a;
      loser = b;
    } else if (answer === '2') {
      winner = b;
      loser = a;
    } else if (answer.toLowerCase() === 'q') {
      console.log('Saving and exiting...');
      fs.writeFileSync('movies-with-elo.json', JSON.stringify(movies, null, 2));
      rl.close();
      process.exit(0);
    } else {
      console.log('Invalid input.');
      rl.close();
      return setTimeout(() => startMatchup(), 100);
    }

    const oldWinnerElo = winner.elo;
    const oldLoserElo = loser.elo;
    calculateElo(winner, loser);

    console.log(`\nResult:`);
    console.log(`${winner.title} won!`);
    console.log(`${winner.title}: ${oldWinnerElo} → ${winner.elo} (Δ ${winner.elo - oldWinnerElo})`);
    console.log(`${loser.title}: ${oldLoserElo} → ${loser.elo} (Δ ${loser.elo - oldLoserElo})`);

    rl.close();
    setTimeout(() => startMatchup(), 100);
  });
}

function startMatchup() {
  const pair = getRandomWeightedPair();
  promptUser(pair);
}

startMatchup();