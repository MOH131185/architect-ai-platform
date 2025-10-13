# 🚀 Quick Start Guide - ArchitectAI Platform

## ⚡ Immediate Setup (5 minutes)

### 1. **Set Up Environment Variables**
```bash
# Run the setup script
setup-env.bat

# Or manually copy and edit:
copy env.template .env
```

### 2. **Add Your API Keys to .env**
Edit `.env` file and add your actual API keys:

```env
# Get these from the respective platforms:
REACT_APP_OPENAI_API_KEY=sk-your-openai-key-here
REACT_APP_REPLICATE_API_KEY=r8_your-replicate-key-here  
REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-key-here
REACT_APP_OPENWEATHER_API_KEY=your-openweather-key-here
```

### 3. **Start Development Server**
```bash
npm install
npm run dev
```

## 🔧 Performance Issues Fixed

✅ **Environment Variables**: Created setup script and template  
✅ **ESLint Warnings**: Fixed all build warnings  
✅ **Build Process**: Now compiles successfully  
✅ **API Configuration**: Proper fallback handling  

## 🚨 Critical: Add Your API Keys

**Without API keys, the app will:**
- Take 30-60 seconds per generation
- Show "Generating..." but never complete
- Use placeholder images instead of real AI generation

**Get your API keys:**
1. **OpenAI**: https://platform.openai.com/api-keys
2. **Replicate**: https://replicate.com/account/api-tokens  
3. **Google Maps**: https://console.cloud.google.com/apis/credentials
4. **OpenWeather**: https://openweathermap.org/api

## 🎯 Expected Performance After Setup

- **Location Analysis**: 2-5 seconds
- **AI Generation**: 30-60 seconds (real AI)
- **Image Generation**: 20-40 seconds per image
- **Total Workflow**: 2-3 minutes for complete design

## 🐛 Troubleshooting

**If still slow/no generation:**
1. Check browser console for API errors
2. Verify API keys are correct in `.env`
3. Restart development server after adding keys
4. Check network tab for failed API calls

**Common Issues:**
- Missing API keys → Use fallback data (slow)
- Invalid API keys → API errors in console
- Network issues → Check internet connection
- CORS errors → Use `npm run dev` (not just `npm start`)

## 📊 Performance Monitoring

The app now includes:
- Real-time progress indicators
- Fallback data for missing APIs
- Error handling with user feedback
- Optimized build process

---

**Next Steps**: Add your API keys and restart the server for full functionality!
