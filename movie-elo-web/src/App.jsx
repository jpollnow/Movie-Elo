import React, { useState, useEffect } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from './supabase';

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateElo(winner, loser, k = 32) {
  const expectedWin = expectedScore(winner.elo, loser.elo);
  const expectedLose = expectedScore(loser.elo, winner.elo);
  winner.elo = Math.round(winner.elo + k * (1 - expectedWin));
  loser.elo = Math.round(loser.elo + k * (0 - expectedLose));
}

async function uploadMoviesToSupabase(movies, userId) {
  const dataToInsert = movies.map((movie) => ({
    user_id: userId,
    title: movie.title,
    rating: movie.rating,
    elo: movie.elo,
    uri: movie.uri,
  }));
  const { error } = await supabase
    .from('movies')
    .upsert(dataToInsert, { onConflict: ['user_id', 'title'] });
  if (error) console.error('Supabase upload error:', error);
}

async function loadMoviesFromSupabase(userId) {
  const { data, error } = await supabase
    .from('movies')
    .select('title, rating, elo, uri')
    .eq('user_id', userId);
  if (error) {
    console.error('Error loading movies:', error);
    return [];
  }
  return data;
}

async function deleteUserMovies(userId, setMovies, setNeedsUpload) {
  const confirmed = window.confirm(
    'Are you sure you want to delete all your rankings? This cannot be undone.'
  );
  if (!confirmed) return;
  const { error } = await supabase.from('movies').delete().eq('user_id', userId);
  if (error) {
    alert('Error deleting your data.');
    console.error(error);
  } else {
    setMovies([]);
    setNeedsUpload(true);
    alert('Your rankings have been deleted.');
  }
}

function downloadLetterboxdList(rankings) {
  const rows = [
    ['Title', 'Year', 'Letterboxd URI', 'Review'],
    ...rankings.map((m) => {
      const [name, year] = m.title.match(/(.+) (\d{4})$/)?.slice(1) || [m.title, ''];
      return [name, year, m.uri || '', `Elo ${m.elo}`];
    }),
  ];

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    rows.map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'letterboxd_list.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [movies, setMovies] = useState([]);
  const [pair, setPair] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [viewRankings, setViewRankings] = useState(false);
  const [needsUpload, setNeedsUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadAttempt, setUploadAttempt] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        loadMoviesFromSupabase(session.user.id).then((loadedMovies) => {
          setMovies(loadedMovies);
          if (loadedMovies.length >= 2) {
            pickPair(loadedMovies);
          } else {
            setNeedsUpload(true);
          }
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        loadMoviesFromSupabase(session.user.id).then((loadedMovies) => {
          setMovies(loadedMovies);
          if (loadedMovies.length >= 2) {
            pickPair(loadedMovies);
          } else {
            setNeedsUpload(true);
          }
        });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const pickPair = (list) => {
    if (list.length < 2) return;
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    setPair([shuffled[0], shuffled[1]]);
    setShowResults(false);
    setResults(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setUploadAttempt(1);

    let response;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      setUploadAttempt(attempts + 1);
      try {
        response = await fetch('https://movie-elo-tna6.onrender.com/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'x-user-id': session.user.id,
          },
        });

        if (response.ok) break;
        attempts++;
        await new Promise((res) => setTimeout(res, 10000));
      } catch (err) {
        attempts++;
        await new Promise((res) => setTimeout(res, 10000));
      }
    }

    setUploading(false);

    if (!response || !response.ok) {
      alert('Upload failed after multiple attempts. The server might still be waking up — please try again shortly.');
      return;
    }

    const data = await response.json();
    setMovies((prev) => {
      const all = [...prev];
      data.forEach((movie) => {
        if (!all.find((m) => m.title === movie.title)) {
          all.push(movie);
        }
      });
      if (all.length >= 2) {
        setNeedsUpload(false);
        pickPair(all);
      }
      alert('✅ Upload complete! Your rankings have been added.');
      return all;
    });
  };

  const handleVote = (winnerIdx) => {
    if (showResults) return;

    const winner = { ...pair[winnerIdx] };
    const loser = { ...pair[1 - winnerIdx] };

    const oldWinnerElo = winner.elo;
    const oldLoserElo = loser.elo;

    updateElo(winner, loser);

    const updatedMovies = movies.map((m) =>
      m.title === winner.title ? winner : m.title === loser.title ? loser : m
    );

    setMovies(updatedMovies);
    uploadMoviesToSupabase(updatedMovies, session.user.id);

    setResults({ winner, loser, oldWinnerElo, oldLoserElo });
    setShowResults(true);
  };

  const rankings = [...movies].sort((a, b) => b.elo - a.elo);

  return (
    <div className="p-4 max-w-5xl mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">🎬 Movie Elo Matchup</h1>

      {!session ? (
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} />
      ) : uploading ? (
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-2">
            Uploading… please wait while the server wakes up (attempt {uploadAttempt} of 10). This may take up to 2 minutes.
          </p>
        </div>
      ) : needsUpload ? (
        <div className="mt-4">
          <p className="mb-2">You don't have any movies uploaded yet. Upload your ratings.csv to get started:</p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="mb-4"
          />
        </div>
      ) : (
        <>
          <button
            className="mb-2 bg-gray-100 !text-black px-4 py-2 rounded hover:bg-gray-200 transition"
            onClick={() => setViewRankings(!viewRankings)}
          >
            {viewRankings ? 'Back to Matchup' : 'View Elo Rankings'}
          </button>

          {viewRankings && (
            <button
              className="mb-4 bg-green-600 !text-white px-4 py-2 rounded hover:bg-green-700 transition"
              onClick={() => downloadLetterboxdList(rankings)}
            >
              Download Letterboxd List
            </button>
          )}

          <button
            className="mb-2 bg-red-500 !text-white px-4 py-2 rounded hover:bg-red-600 transition"
            onClick={() => deleteUserMovies(session.user.id, setMovies, setNeedsUpload)}
          >
            Delete My Rankings
          </button>

          <button
            className="mb-4 bg-gray-200 !text-black px-4 py-2 rounded hover:bg-gray-300 transition"
            onClick={() => document.getElementById('reupload').click()}
          >
            Add New Movies
          </button>
          <input
            id="reupload"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          {viewRankings ? (
            <div className="text-left">
              <h2 className="text-xl font-semibold mb-2">📊 Elo Rankings</h2>
              <ul className="text-sm">
                {rankings.map((movie, idx) => (
                  <li key={movie.title} className="mb-1">
                    <strong>{idx + 1}.</strong> {movie.title} — Elo: {movie.elo}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="w-full flex justify-center items-start gap-8 mb-8 flex-wrap">
              {pair.map((movie, idx) => (
                <div key={movie.title} className="flex flex-col items-center w-64">
                  <div className="h-[375px] w-full flex items-center justify-center bg-gray-200 text-black text-lg rounded shadow mb-2">
                    {movie.title}
                  </div>
                  <button
                    className="bg-blue-600 !text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                    onClick={() => handleVote(idx)}
                  >
                    Pick
                  </button>
                </div>
              ))}
            </div>
          )}

          {showResults && results && (
            <div className="mb-4 text-sm text-gray-600">
              <p>Result:</p>
              <p>
                {results.winner.title}: {results.oldWinnerElo} → {results.winner.elo} (Δ {results.winner.elo - results.oldWinnerElo})
              </p>
              <p>
                {results.loser.title}: {results.oldLoserElo} → {results.loser.elo} (Δ {results.loser.elo - results.oldLoserElo})
              </p>
              <button
                className="mt-2 bg-gray-100 !text-black px-4 py-2 rounded hover:bg-gray-200 transition"
                onClick={() => pickPair(movies)}
              >
                Next Matchup
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
