import React from 'react';

// Test imports one by one to find the culprit

// Import 1: Wrapper
import { Wrapper } from "@googlemaps/react-wrapper";

// Import 2: Icons
import {
  MapPin, Upload, Building, Building2, Sun, Compass, FileText,
  Palette, Square, Loader2, Sparkles, ArrowRight,
  Check, Home, Layers, Cpu, FileCode, Clock, TrendingUp,
  Users, Shield, Zap, BarChart3, Eye, AlertCircle, AlertTriangle, X, ZoomIn, ZoomOut, Maximize2,
  Image, Edit3, Plus, Trash2, Download, Wand2, Map
} from 'lucide-react';

const ArchitectAITest = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Test Component</h1>
      <p>If you see this, basic imports work!</p>
      <MapPin size={24} />
      <Building size={24} />
    </div>
  );
};

export default ArchitectAITest;
