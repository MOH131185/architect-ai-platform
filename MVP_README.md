# ArchiAI MVP - AI-Powered Architectural Design

This MVP provides a shortcut for testing AI-powered architectural design while fine-tuning your custom reasoning and generation models.

## Features

### 🤖 AI Design Reasoning (OpenAI)
- **Design Philosophy**: AI-generated design approach and principles
- **Spatial Organization**: Intelligent space planning and layout strategies
- **Material Recommendations**: Context-aware material selection
- **Environmental Considerations**: Sustainability and climate-responsive design
- **Technical Solutions**: Structural and MEP system recommendations
- **Code Compliance**: Building code and zoning optimization
- **Cost Strategies**: Value engineering and lifecycle cost analysis
- **Future Proofing**: Adaptable design for evolving needs

### 🎨 AI Image Generation (Replicate/SDXL)
- **Multiple Views**: Exterior, interior, site plan, and section views
- **Style Variations**: Modern, sustainable, contemporary, and traditional approaches
- **Reasoning-Based Generation**: Visualizations based on AI design reasoning
- **ControlNet Integration**: Advanced control for architectural elements
- **High-Quality Output**: Professional architectural visualizations

## Setup

### 1. Environment Variables
The following API keys are already configured in `.env`:

```env
# OpenAI API for Design Reasoning
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here

# Replicate API for Image Generation
REACT_APP_REPLICATE_API_KEY=your_replicate_api_key_here
```

> **Note:** Your actual API keys are already configured in your local `.env` file. Do NOT commit the `.env` file to GitHub.

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Usage

### Quick Design (MVP)
1. Fill in the project context form
2. Click "Quick Design (MVP)" for fast AI reasoning + single visualization
3. Review the generated design reasoning and visualization

### Complete Design Workflow
1. Fill in the project context form
2. Click "Complete Design Workflow" for comprehensive AI analysis
3. Get multiple views, style variations, alternatives, and feasibility analysis

## Project Context Options

### Building Program
- Residential Building
- Commercial Building
- Office Building
- Mixed-Use Building
- Cultural Building

### Architectural Styles
- Contemporary
- Modern
- Traditional
- Sustainable
- Futuristic

### Materials
- Glass and Steel
- Concrete and Wood
- Stone and Brick
- Advanced Materials
- Traditional Materials

## AI Services Architecture

### OpenAI Service (`src/services/openaiService.js`)
- **Design Reasoning**: Comprehensive architectural analysis
- **Feasibility Analysis**: Project viability assessment
- **Style Variations**: Different design approaches
- **Fallback Support**: Works without API when needed

### Replicate Service (`src/services/replicateService.js`)
- **SDXL Multi-ControlNet LoRA**: Advanced architectural visualization
- **Multiple Views**: Exterior, interior, site plan, sections
- **Style Variations**: Different architectural approaches
- **ControlNet Integration**: Precise architectural control
- **Fallback Images**: Placeholder images when API unavailable

### AI Integration Service (`src/services/aiIntegrationService.js`)
- **Complete Workflow**: End-to-end AI design process
- **Quick Design**: Fast MVP testing
- **Service Orchestration**: Coordinates OpenAI and Replicate
- **Error Handling**: Graceful fallbacks and error management

## API Integration Details

### OpenAI Integration
- **Model**: GPT-4 for advanced reasoning
- **Temperature**: 0.7 for creative but consistent responses
- **Max Tokens**: 2000 for comprehensive analysis
- **System Prompt**: Expert architectural AI assistant
- **Error Handling**: Fallback to predefined responses

### Replicate Integration
- **Model**: SDXL with Multi-ControlNet LoRA
- **Resolution**: 1024x768 for architectural views
- **Steps**: 50-60 for quality generation
- **Guidance Scale**: 7.5-8.0 for architectural precision
- **ControlNet**: Architectural element control
- **Error Handling**: Placeholder images when unavailable

## Fallback Behavior

When APIs are unavailable, the system provides:
- **Design Reasoning**: Predefined architectural principles
- **Visualizations**: Placeholder images with appropriate labels
- **Analysis**: Basic feasibility and recommendations
- **User Experience**: Clear indication of fallback mode

## Development Notes

### File Structure
```
src/
├── services/
│   ├── openaiService.js          # OpenAI integration
│   ├── replicateService.js        # Replicate integration
│   └── aiIntegrationService.js    # Service orchestration
├── components/
│   ├── AIMVP.js                  # MVP interface
│   └── AIMVP.css                 # MVP styling
└── App.js                        # Main application
```

### Error Handling
- API failures gracefully fall back to predefined responses
- Network issues show appropriate error messages
- Missing API keys trigger fallback mode
- User feedback for all states (loading, success, error, fallback)

### Performance
- Parallel API calls where possible
- Efficient state management
- Responsive UI with loading states
- Optimized image handling

## Testing Your Fine-Tuned Models

When your custom models are ready:

1. **Replace OpenAI Service**: Update `openaiService.js` to use your reasoning model
2. **Replace Replicate Service**: Update `replicateService.js` to use your generation model
3. **Update Integration**: Modify `aiIntegrationService.js` for new model endpoints
4. **Test Workflow**: Use the MVP interface to test your models

## Next Steps

1. **Test Current Setup**: Verify APIs are working with the MVP
2. **Fine-Tune Models**: Develop your custom reasoning and generation models
3. **Replace Services**: Update services to use your models
4. **Enhance UI**: Improve the interface based on your model capabilities
5. **Production Ready**: Scale and optimize for production use

## Support

- Check browser console for detailed error messages
- Verify API keys are correctly set in `.env`
- Test with simple project contexts first
- Monitor API usage and quotas
- Check network connectivity for API calls

This MVP provides a solid foundation for testing AI-powered architectural design while you develop your custom models!
