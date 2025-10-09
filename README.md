# Music Story (YouTube)

**Transform any artist or music topic into an immersive audio documentary**

Music Story uses AI to generate compelling, professionally-narrated documentaries that blend historical context, artist insights, and cultural analysis with perfectly curated tracks. This build is YouTube-only and requires no Spotify account.

Built with OpenAI for intelligent content generation and TTS narration, and the YouTube IFrame Player + Data API for video playback and search.

## Features

- **AI-Powered Documentary Generation**: Enter any artist, band, or music topic and get an instant audio documentary with historical context, cultural insights, and 5 carefully selected tracks
- **Professional AI Narration**: High-quality text-to-speech narration using OpenAI's latest models
- **YouTube Playback (no login required)**: Tracks are mapped to YouTube and played via the YouTube IFrame Player
- **Save & Share**: Persistent playlists with shareable links
- **Responsive UI**: Clean interface optimized for desktop and mobile
- **Mock Mode**: Optional dev mode with placeholder audio to save API costs during testing

## Prerequisites

- Node.js (v14 or later)
- npm (comes with Node.js)
- A Google Cloud project with YouTube Data API v3 enabled

## Setup

### 1. Configure Environment Variables

1. Rename the `.env.example` file to `.env`
2. Update the following variables in the `.env` file:
   ```env
   # Server
   PORT=8888
   CLIENT_DEBUG=0     # set 1 for verbose client logs
   SERVER_DEBUG=0     # set 1 for verbose server logs

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_TTS_MODEL=gpt-4o-mini-tts
   OPENAI_TTS_VOICE=alloy
   OPENAI_TTS_SPEED=1.0
   TTS_OUTPUT_DIR=public/tts

   # Development Features
   MOCK_TTS=0         # set 1 to use a local placeholder MP3 instead of OpenAI TTS

   # YouTube Data API v3
   # Create an API key in Google Cloud Console and restrict it to YouTube Data API v3
   YOUTUBE_API_KEY=your_youtube_data_api_key
   ```

### 2. Enable YouTube Data API v3

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create an API key (restrict it to the YouTube Data API v3)
3. Enable the API: APIs & Services → Library → "YouTube Data API v3"
4. Paste the key into `YOUTUBE_API_KEY` in `.env`

### 3. Install Dependencies

```bash
npm install
```

### 4. Add MP3 Files (optional)

1. Create a directory called `public/audio` in your project root
2. Add your MP3 files to this directory
3. Update the `setupDefaultPlaylist()` function in `public/player.js` to include your MP3 files

### 5. Start the Server

```bash
npm run dev
```

This runs the modular server (`src/server.js`) with nodemon and serves `public/`.

### 6. Access the Application

Open your web browser and navigate to:

```
http://localhost:8888
```

## How to Use

1. Open `http://localhost:8888`.
2. Enter a topic and click "Generate Outline". The server generates the timeline.
3. The client maps songs to YouTube and plays via the YouTube IFrame player.
4. Playlists are saved with `ownerId: "anonymous"` by default.

You can import a saved playlist via the "Import by ID" button. The URL includes `?playlistId=...` for refresh persistence.

## Documentary Generation Flow (high level)

1. LLM plans the documentary narrative and selects 5 representative songs.
2. Client maps songs to YouTube videos (title/artist + optional hints).
3. TTS narration is generated for narration segments.
4. A playable interleaved timeline is built and saved.

### Example: The Prodigy

**Stage 2 Plan Output**:

```json
{
  "title": "The Prodigy: Rave to Riot",
  "narrative_arc": "From underground rave pioneers to mainstream crossover...",
  "era_covered": "1992-1997",
  "required_tracks": [
    {
      "song_title": "Charly",
      "approximate_year": "1992",
      "why_essential": "Breakthrough rave anthem that defined early sound",
      "narrative_role": "Origins - underground rave scene"
    },
    {
      "song_title": "Firestarter",
      "approximate_year": "1996",
      "why_essential": "Mainstream crossover moment, controversial punk-rave fusion",
      "narrative_role": "Peak - commercial breakthrough"
    }
    // ... 3 more tracks
  ]
}
```

The client searches YouTube for the selected song titles/artists and picks the best match.

## Customizing the Default Playlist

To customize defaults, adjust playlist building logic in `public/player.js`. You can add local MP3 narration, tweak mapping, or change UI behavior.

### Keyboard Shortcuts

- **Space**: Play/Pause
- **Ctrl + →**: Next track
- **Ctrl + ←**: Previous track
- **Ctrl + ↑**: Increase volume
- **Ctrl + ↓**: Decrease volume

## Troubleshooting

- **YouTube player not initializing**: Ensure the YouTube IFrame API can load and try a normal refresh.
- **CORS**: Serve from `http://localhost:8888` (default) or configure your reverse proxy accordingly.
- **TTS costs/time during development**: Set `MOCK_TTS=1` to use a bundled local MP3 for narration.

## Design Notes

- **Routing**: The app serves a single YouTube player on `/`.
- **SDK Loading**: Only the YouTube IFrame API is loaded on the client.
- **Persistence**: Playlists saved to `data/playlists/*.json`. Each record includes YouTube mapping data per song.
- **Owners**: Saved playlists use `ownerId: "anonymous"` by default.

---

## Environment Variables Reference

- `PORT` - Server port (default: 8888)
- `CLIENT_DEBUG`, `SERVER_DEBUG` - Enable verbose logging
- `OPENAI_API_KEY` - OpenAI API key for LLM and TTS
- `OPENAI_TTS_MODEL` - TTS model (default: gpt-4o-mini-tts)
- `OPENAI_TTS_VOICE` - Voice selection (alloy, echo, fable, onyx, nova, shimmer)
- `OPENAI_TTS_SPEED` - Playback speed 0.25-4.0 (default: 1.0)
- `TTS_OUTPUT_DIR` - Where to save generated MP3s
- `MOCK_TTS` - Set to 1 to use placeholder MP3s instead of OpenAI (saves costs during development)
- `YOUTUBE_API_KEY` - YouTube Data API v3 key used for mapping/search

---

## Development Notes

- Run in dev with nodemon: `npm run dev` (uses `src/server.js`).
- The client’s `DEBUG` mode is toggled from the server via `/config.js` and `CLIENT_DEBUG`.
- The Generate Outline button shows an inline spinner while work is in progress.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgements

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [OpenAI Responses + TTS](https://platform.openai.com/docs)
