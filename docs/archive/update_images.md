# Image Click Handler Updates

## Instructions for updating all remaining images to be clickable:

### For all 3D View Images (Exterior Side, Interior, Axonometric, Perspective):
1. Add `cursor-pointer hover:shadow-xl transition-shadow` to the container div className
2. Add `onClick={() => generatedDesigns?.model3D.images?.[INDEX] && openImageModal(generatedDesigns.model3D.images[INDEX], 'VIEW_NAME')}`
3. Add zoom icon overlay:
```jsx
{generatedDesigns?.model3D.images?.[INDEX] && (
  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
    <ZoomIn className="w-4 h-4 text-gray-700" />
  </div>
)}
```

### Image Indexes:
- [0] = Exterior Front View
- [1] = Exterior Side View
- [2] = Interior View
- [3] = Axonometric View
- [4] = Perspective View

### For Technical Drawings (Elevations & Sections):
Similar pattern but with different data structure:
- Elevations: generatedDesigns.technicalDrawings.elevations[direction]
- Sections: generatedDesigns.technicalDrawings.sections[type]