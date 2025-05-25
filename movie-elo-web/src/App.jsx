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

async function fetchPoster(title) {
  const apiKey = import.meta.env.VITE_OMDB_API_KEY;
  const match = title.match(/(.+?)\s(\d{4})$/);
  const name = match ? match[1].trim() : title;
  const year = match ? match[2] : '';

  const res = await fetch(`https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(name)}&y=${year}`);
  const data = await res.json();
  return data.Poster && data.Poster !== 'N/A' ? data.Poster : null;
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

async function deleteUserMovies(userId, setMovies) {
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
    alert('Your rankings have been deleted.');
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [movies, setMovies] = useState([]);
  const [pair, setPair] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [viewRankings, setViewRankings] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        loadMoviesFromSupabase(session.user.id).then(async (loadedMovies) => {
          const withPosters = await Promise.all(
            loadedMovies.map(async (movie) => ({
              ...movie,
              poster: await fetchPoster(movie.title),
            }))
          );
          setMovies(withPosters);
          if (withPosters.length >= 2) pickPair(withPosters);
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        loadMoviesFromSupabase(session.user.id).then(async (loadedMovies) => {
          const withPosters = await Promise.all(
            loadedMovies.map(async (movie) => ({
              ...movie,
              poster: await fetchPoster(movie.title),
            }))
          );
          setMovies(withPosters);
          if (withPosters.length >= 2) pickPair(withPosters);
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

    try {
      const response = await fetch('https://movie-elo-tna6.onrender.com/upload
', {
        method: 'POST',
        body: formData,
        headers: {
          'x-user-id': session.user.id,
        },
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      const withPosters = await Promise.all(
        data.map(async (movie) => ({
          ...movie,
          poster: await fetchPoster(movie.title),
        }))
      );

      setMovies((prev) => {
        const all = [...prev];
        withPosters.forEach((movie) => {
          if (!all.find((m) => m.title === movie.title)) {
            all.push(movie);
          }
        });
        pickPair(all);
        return all;
      });
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('There was an error uploading your file.');
    }
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
      ) : (
        <>
          <button
            className="mb-2 bg-gray-100 !text-black px-4 py-2 rounded hover:bg-gray-200 transition"
            onClick={() => setViewRankings(!viewRankings)}
          >
            {viewRankings ? 'Back to Matchup' : 'View Elo Rankings'}
          </button>

          <button
            className="mb-2 bg-red-500 !text-white px-4 py-2 rounded hover:bg-red-600 transition"
            onClick={() => deleteUserMovies(session.user.id, setMovies)}
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
                  {movie.poster && (
                    <img
                      src={movie.poster}
                      alt={movie.title}
                      className="rounded shadow mb-2"
                      style={{ maxHeight: '400px', objectFit: 'cover' }}
                    />
                  )}
                  <h2 className="text-lg font-semibold mb-2 text-center">{movie.title}</h2>
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
