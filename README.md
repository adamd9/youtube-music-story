# Music Story

**Transform any artist or music topic into an immersive audio documentary**

Music Story uses AI to generate compelling, professionally-narrated documentaries that blend historical context, artist insights, and cultural analysis with perfectly curated tracks.

Built with OpenAI for intelligent content generation and TTS narration, and the YouTube IFrame Player for video playback.

## 🎧 Live Demo

Try it now: **[musicstory.drop37.com](https://musicstory.drop37.com/)**

No login required—just enter an artist or music topic and get an instant audio documentary!

## Why I Built This

I made this project for **me**.

Spotify changed their policies and stopped allowing podcast creators to use music tracks in their shows (the *Music + Talk* feature). This killed a podcast I absolutely loved—one that didn't just play music, but told the *stories* behind it. The bands, the people, the history. I love exploring new music, but what I love even more is learning the context: who made it, why they made it, what was happening in their lives.

So I built this. It's a personal project that lets me keep doing what that podcast did—discover music and dive into its story—using the power of AI. No platform restrictions, no gatekeepers. Just music, history, and the stories that make it all meaningful.

## Features

- **AI-Powered Documentary Generation**: Enter any artist, band, or music topic and get an instant audio documentary with historical context, cultural insights, and 5 carefully selected tracks
- **Professional AI Narration**: High-quality text-to-speech narration using OpenAI's latest models
- **YouTube Playback**: Tracks are automatically mapped to YouTube and played via the YouTube IFrame Player (no login required)
- **Save & Share**: Persistent playlists with shareable links
- **Responsive UI**: Clean interface optimized for desktop and mobile
- **Mock Mode**: Optional dev mode with placeholder audio to save API costs during testing

## Prerequisites

- Node.js (v14 or later)
- npm (comes with Node.js)
- OpenAI API key

## Setup

### 1. Configure Environment Variables

1. Rename the `.env.example` file to `.env`
2. Update the following variables in the `.env` file:
   ```env
   # Server
   PORT=8888
   CLIENT_DEBUG=0     # set to 1 for verbose client logs
   SERVER_DEBUG=0     # set to 1 for verbose server logs

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_TTS_MODEL=gpt-4o-mini-tts
   OPENAI_TTS_VOICE=nova
   OPENAI_TTS_SPEED=1.25

   # Development Features
   MOCK_TTS=0         # set to 1 to use a local placeholder MP3 instead of OpenAI TTS
   ```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
npm run dev
```

This runs the modular server (`src/server.js`) with nodemon and serves `public/`.

### 4. Access the Application

Open your web browser and navigate to:

```
http://localhost:8888
```

## How to Use

1. Open `http://localhost:8888`
2. Enter a topic (e.g., "The Beatles early years") and click "Generate Outline"
3. The AI generates a documentary with narration and 5 songs
4. Songs are automatically mapped to YouTube videos and played via the YouTube IFrame player
5. Your generated playlists are saved to **local storage** and appear in "My Playlists"
6. All community playlists appear in "Recent Community Playlists"

### First-Time vs Returning Users

- **New users**: The latest community playlist auto-loads on first visit
- **Returning users**: Your most recent playlist auto-loads from local storage
- **Share playlists**: Use the "Share this playlist" button to get a shareable URL with `?playlistId=...`

## Documentary Generation Flow

1. **User Input**: Enter an artist, band, or music topic
2. **AI Generation**: LLM creates a documentary outline with narration segments and 5 representative songs
3. **YouTube Mapping**: Server automatically maps songs to YouTube videos using web scraping
4. **TTS Generation**: OpenAI TTS converts narration text to professional audio
5. **Playback**: Interleaved timeline of narration and music is played via YouTube IFrame Player
6. **Persistence**: Playlist is saved and can be shared via URL

### Example Output: The Prodigy

**Generated Documentary Structure**:

```json
{
  "title": "The Prodigy: Rave Revolutionaries",
  "topic": "The Prodigy",
  "summary": "From underground rave pioneers to mainstream crossover icons, explore The Prodigy's explosive journey through the 1990s electronic music scene.",
  "timeline": [
    {
      "type": "narration",
      "title": "Introduction: The Early Years",
      "text": "Welcome to this audio documentary on The Prodigy, covering their groundbreaking era from 1992 to 1997. We'll explore how this Essex-based group transformed from underground rave heroes into one of the most influential electronic acts of the decade..."
    },
    {
      "type": "narration",
      "title": "Breakthrough Moment",
      "text": "In 1992, The Prodigy released 'Charly', a track that would define the early rave sound. Built around a sample from a 1970s public information film, the song captured the playful yet rebellious spirit of the emerging rave scene..."
    },
    {
      "type": "song",
      "title": "Charly",
      "artist": "The Prodigy",
      "album": "Experience",
      "year": "1992",
      "youtube_hint": "official audio"
    },
    {
      "type": "narration",
      "title": "Mainstream Crossover",
      "text": "By 1996, The Prodigy had evolved dramatically. 'Firestarter' marked their explosive crossover into mainstream consciousness, blending punk attitude with breakbeat fury..."
    },
    {
      "type": "song",
      "title": "Firestarter",
      "artist": "The Prodigy",
      "album": "The Fat of the Land",
      "year": "1996",
      "youtube_hint": "official video"
    }
    // ... 3 more narration/song pairs
  ]
}
```

The server automatically searches YouTube for each song and maps it to the best matching video.

## Customization

You can customize the documentary generation by:

- Adjusting the AI prompts in `src/prompts/musicDoc/`
- Modifying the TTS voice and speed in `.env`
- Changing the narration segment length in the UI (30s, 1min, 3min, or 5min)
- Adding custom instructions when generating a documentary

### Keyboard Shortcuts

- **Space**: Play/Pause
- **Ctrl + →**: Next track
- **Ctrl + ←**: Previous track
- **Ctrl + ↑**: Increase volume
- **Ctrl + ↓**: Decrease volume

## Troubleshooting

- **YouTube player not initializing**: Ensure the YouTube IFrame API can load and try a normal refresh
- **CORS errors**: Serve from `http://localhost:8888` (default) or configure your reverse proxy accordingly
- **TTS costs/time during development**: Set `MOCK_TTS=1` to use a bundled local MP3 for narration
- **YouTube search not finding songs**: The app uses web scraping which may occasionally fail if YouTube changes their structure
- **MongoDB connection issues**: Check the startup logs for detailed error messages. See [Server Startup Logging Guide](docs/SERVER_STARTUP_LOGGING.md) for troubleshooting.

## Architecture Overview

Music Story is built as a modular Express.js application with a clean separation between frontend and backend concerns.

### Backend Architecture

**Core Components:**

- **`src/server.js`** - Application entry point, initializes directories and starts Express server
- **`src/app.js`** - Express app configuration, middleware setup, and route mounting
- **`src/config.js`** - Centralized configuration management from environment variables

**Services Layer** (`src/services/`):

- **`musicDoc.js`** - Generates documentary outlines using OpenAI's structured output API (gpt-5-mini with reasoning)
- **`tts.js`** - Converts narration text to speech using OpenAI TTS API with customizable voice/speed
- **`youtubeMap.js`** - Maps songs to YouTube videos using `youtube-sr` web scraping (no API key needed)
- **`jobManager.js`** - In-memory job queue with SSE progress streaming, handles concurrent generation requests
- **`storage.js`** - Playlist persistence abstraction layer with MongoDB and JSON file backend support
- **`storage/mongoStorage.js`** - MongoDB storage implementation with automatic indexing
- **`storage/jsonStorage.js`** - JSON file storage implementation (atomic writes)
- **`storage/migration.js`** - Automatic migration from JSON files to MongoDB when configured
- **`openaiClient.js`** - Configured OpenAI SDK client instance

**Routes** (`src/routes/`):

- **`musicDocLite.js`** - POST `/api/music-doc-lite` - Generate documentary outline
- **`tts.js`** - POST `/api/tts-batch` - Batch TTS generation for narration segments
- **`youtube.js`** - POST `/api/youtube-map` - Map songs to YouTube videos
- **`playlists.js`** - CRUD operations for saved playlists
- **`jobs.js`** - SSE endpoint for real-time generation progress
- **`configRoute.js`** - Serves client configuration (debug flags, etc.)

**Utilities** (`src/utils/`):

- **`promptLoader.js`** - Loads and fills prompt templates from `src/prompts/`
- **`logger.js`** - Debug logging utilities (controlled by `SERVER_DEBUG` env var)

### Frontend Architecture

**Single-Page Application** (`public/`):

- **`index.html`** - Main UI with documentary generation form, playlist viewer, and YouTube player
- **`player.js`** - Client-side player logic (~1680 lines):
  - YouTube IFrame API integration for music playback
  - HTML5 Audio element for narration MP3s
  - Playlist management and track sequencing
  - Progress tracking and UI updates
  - Keyboard shortcuts (Space, Ctrl+arrows)
- **`styles.css`** - Responsive styling with dark/light theme support
- **`config.js`** - Dynamic client config served by backend

### Data Flow

1. **User Input** → Client sends topic + optional instructions to `/api/music-doc-lite`
2. **LLM Generation** → `musicDoc.js` calls OpenAI with structured schema, returns timeline with narration segments and 5 songs
3. **YouTube Mapping** → Server automatically maps songs to YouTube videos via `youtubeMap.js`
4. **TTS Generation** → Client requests batch TTS for narration segments via `/api/tts-batch`
5. **Playlist Assembly** → Client builds interleaved playlist of narration (MP3) and music (YouTube) tracks
6. **Playback** → YouTube IFrame Player handles music, HTML5 Audio handles narration
7. **Persistence** → Playlist saved to `data/playlists/{id}.json` with shareable URL

### Key Design Decisions

- **No Authentication**: Uses anonymous user model (`ownerId: "anonymous"`) for simplicity
- **YouTube Web Scraping**: Avoids YouTube API quotas by using `youtube-sr` package
- **Structured Output**: Uses OpenAI's JSON schema validation for reliable documentary generation
- **In-Memory Jobs**: Job queue survives page refresh but not server restart (acceptable for demo)
- **Mock Mode**: `MOCK_TTS=1` uses placeholder audio to save API costs during development
- **Modular Prompts**: All AI prompts externalized to `src/prompts/` for easy iteration

---

## Environment Variables Reference

- `PORT` - Server port (default: 8888)
- `CLIENT_DEBUG` - Set to 1 to enable verbose client logs in browser console
- `SERVER_DEBUG` - Set to 1 to enable verbose server logs
- `OPENAI_API_KEY` - OpenAI API key for LLM and TTS (required)
- `OPENAI_TTS_MODEL` - TTS model (default: gpt-4o-mini-tts)
- `OPENAI_TTS_VOICE` - Voice selection: alloy, echo, fable, onyx, nova, shimmer (default: nova)
- `OPENAI_TTS_SPEED` - Playback speed 0.25-4.0 (default: 1.25)
- `OPENAI_IMAGE_MODEL` - Image generation model for narration album art (default: gpt-image-1)
- `MOCK_TTS` - Set to 1 to use placeholder MP3s instead of OpenAI (saves costs during development)
- `MONGODB_URI` - MongoDB connection string (optional). If set, playlists will be stored in MongoDB instead of JSON files. If not set, defaults to JSON file storage in `$RUNTIME_DATA_DIR/playlists`
- `RUNTIME_DATA_DIR` - Root directory for playlists and TTS files (default: ./data)
- `TTS_OUTPUT_DIR` - Where to save generated MP3s (default: $RUNTIME_DATA_DIR/tts)

---

## Storage Options

Music Story supports two storage backends for playlists:

### JSON File Storage (Default)

By default, playlists are stored as JSON files in `$RUNTIME_DATA_DIR/playlists` (or `./data/playlists` if `RUNTIME_DATA_DIR` is not set). This requires no additional setup and is suitable for development and small deployments.

### MongoDB Storage (Optional)

For production deployments or when you need centralized database storage, you can configure MongoDB:

1. **Set up MongoDB**: You can use a local MongoDB instance or a cloud service like MongoDB Atlas
2. **Add connection string to `.env`**:
   ```env
   MONGODB_URI=mongodb://localhost:27017/youtube-music-story
   # Or for MongoDB Atlas:
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/youtube-music-story
   ```
3. **Start the server**: The application will automatically connect to MongoDB and use it for playlist storage

**Automatic Migration**: If you have existing JSON playlists and configure MongoDB, the application will automatically migrate them to MongoDB on startup. The JSON files will remain untouched, but all new operations will use MongoDB.

**Migration Idempotency**: The migration only runs once. On subsequent startups, the application detects that MongoDB already contains playlists and skips the migration, even though JSON files remain on disk. This means:
- **First startup** with MongoDB: Migrates JSON → MongoDB
- **Second and later startups**: Skips migration (MongoDB already has data)
- JSON files can safely remain on disk as backups

**Fallback Behavior**: If MongoDB connection fails (invalid URI, network issues, etc.), the application automatically falls back to JSON file storage and logs a warning.

**Troubleshooting**: The server provides detailed logging during startup to help diagnose connection issues. See [Server Startup Logging Guide](docs/SERVER_STARTUP_LOGGING.md) for details on:
- Identifying which storage backend is active
- Understanding MongoDB connection errors
- Diagnosing timeout, authentication, and network issues

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
