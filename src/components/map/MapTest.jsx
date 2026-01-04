/**
 * MapTest.jsx
 * 
 * Simple test component to verify Google Maps integration
 * Use this to debug map loading issues
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

function MapTest() {
  const mapRef = useRef(null);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

    console.log('MapTest: Starting initialization');
    console.log('MapTest: API Key present:', !!apiKey);
    console.log('MapTest: Map container:', mapRef.current);

    if (!apiKey) {
      setError('API key missing');
      setStatus('Error: No API key');
      return;
    }

    if (!mapRef.current) {
      setStatus('Waiting for container...');
      return;
    }

    setStatus('Loading Google Maps API...');

    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'drawing', 'geometry']
    });

    loader
      .load()
      .then((google) => {
        console.log('MapTest: Google Maps loaded!', google);
        setStatus('Creating map instance...');

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 37.7749, lng: -122.4194 },
          zoom: 15,
          mapTypeId: 'hybrid'
        });

        console.log('MapTest: Map created!', map);
        setStatus('✅ Map loaded successfully!');

        // Add a marker
        new google.maps.Marker({
          position: { lat: 37.7749, lng: -122.4194 },
          map,
          title: 'Test Marker'
        });
      })
      .catch((err) => {
        console.error('MapTest: Error loading map:', err);
        setError(err.message);
        setStatus('❌ Error loading map');
      });
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Google Maps Test</h1>
      
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="font-semibold">Status: {status}</p>
        {error && <p className="text-red-600 mt-2">Error: {error}</p>}
      </div>

      <div
        ref={mapRef}
        className="w-full h-[500px] bg-gray-200 rounded shadow-lg"
      />

      <div className="mt-4 p-4 bg-gray-50 border rounded">
        <h3 className="font-bold mb-2">Debug Info:</h3>
        <ul className="text-sm space-y-1">
          <li>API Key: {process.env.REACT_APP_GOOGLE_MAPS_API_KEY ? '✅ Set' : '❌ Missing'}</li>
          <li>Container: {mapRef.current ? '✅ Ready' : '⏳ Not mounted'}</li>
          <li>Window size: {window.innerWidth}x{window.innerHeight}</li>
        </ul>
      </div>
    </div>
  );
}

export default MapTest;

