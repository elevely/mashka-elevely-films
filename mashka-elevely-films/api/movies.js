const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pdrinpkmuddmhvppjjrp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkcmlucGttdWRkbWh2cHBqanJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3OTU0NDQsImV4cCI6MjA3ODM3MTQ0NH0.D06LV6gn_2t8OGS166-hdigyKy6EQ7uNt4EF3dm81qA';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // Устанавливаем CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log('🎬 Movies API called:', req.method);

    switch (req.method) {
      case 'GET':
        console.log('⬇️ Fetching movies from Supabase...');
        
        const { data: movies, error: fetchError } = await supabase
          .from('movies')
          .select('*')
          .order('date_added', { ascending: false });

        if (fetchError) {
          console.error('❌ Supabase fetch error:', fetchError);
          return res.status(500).json({ error: fetchError.message });
        }

        console.log(`✅ Found ${movies.length} movies`);
        
        const formattedMovies = movies.map(movie => ({
          id: movie.id,
          movie: movie.movie_data,
          userRatings: movie.user_ratings,
          girlfriendRatings: movie.girlfriend_ratings,
          userTotal: movie.user_total,
          girlfriendTotal: movie.girlfriend_total,
          finalRating: movie.final_rating,
          dateAdded: movie.date_added,
          userNotes: movie.user_notes || '',
          girlfriendNotes: movie.girlfriend_notes || '',
          hasSpoilers: movie.has_spoilers || false
        }));

        return res.status(200).json(formattedMovies);

      case 'POST':
        console.log('⬆️ Adding new movie...');
        const movieData = req.body;
        console.log('🎥 Movie data:', movieData);
        
        const supabaseMovieData = {
          id: movieData.id,
          movie_data: movieData.movie,
          user_ratings: movieData.userRatings,
          girlfriend_ratings: movieData.girlfriendRatings,
          user_total: movieData.userTotal,
          girlfriend_total: movieData.girlfriendTotal,
          final_rating: movieData.finalRating,
          date_added: movieData.dateAdded || new Date().toISOString(),
          user_notes: movieData.userNotes || '',
          girlfriend_notes: movieData.girlfriendNotes || '',
          has_spoilers: movieData.hasSpoilers || false
        };

        console.log('💾 Saving to Supabase:', supabaseMovieData);
        
        const { data: newMovie, error: insertError } = await supabase
          .from('movies')
          .insert([supabaseMovieData])
          .select();

        if (insertError) {
          console.error('❌ Insert error:', insertError);
          return res.status(500).json({ error: insertError.message });
        }

        console.log('✅ Insert successful:', newMovie);
        
        return res.status(200).json({ 
          success: true, 
          movie: newMovie[0] 
        });

      case 'PUT':
        console.log('✏️ Updating movie notes...');
        const updateData = req.body;
        console.log('Update data:', updateData);
        
        const { error: updateError } = await supabase
          .from('movies')
          .update({
            user_notes: updateData.userNotes,
            girlfriend_notes: updateData.girlfriendNotes,
            has_spoilers: updateData.hasSpoilers
          })
          .eq('id', parseInt(updateData.movieId));

        if (updateError) {
          console.error('❌ Update error:', updateError);
          return res.status(500).json({ error: updateError.message });
        }

        console.log('✅ Update successful');
        return res.status(200).json({ success: true });

      case 'DELETE':
        const { movieId } = req.body;
        console.log('🗑️ Deleting movie ID:', movieId);
        
        const { error: deleteError } = await supabase
          .from('movies')
          .delete()
          .eq('id', parseInt(movieId));

        if (deleteError) {
          console.error('❌ Delete error:', deleteError);
          return res.status(500).json({ error: deleteError.message });
        }
        
        console.log('✅ Delete successful');
        return res.status(200).json({ success: true });

      default:
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error) {
    console.error('💥 API error:', error);
    return res.status(500).json({ 
      error: error.message
    });
  }
};