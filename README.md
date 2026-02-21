# Infinite Terrain

![inf-terrain-screenshot](https://github.com/user-attachments/assets/a347ac31-4387-4ae1-809a-8b1d6f11c3db)


Infinite Terrain is a procedural 3D terrain playground split into two implementations:

- `infinite-terrain-native` (vanilla Three.js, in progress)
- `infinite-terrain-react` (React + React Three Fiber, currently fully developed)

## Live Test Link

https://mesq.me/infinite-terrain/

## React Part (Current Main Version)

Main features:
- Infinite chunk-based terrain generation around the player
- Dithering
- Custom shader materials for terrain, grass, stones, trees, and wind lines
- Physics-based player ball movement and character-grass interaction
- Dynamic grass/wind animation
- Instanced stones and animated trees with wind deformation
- Runtime tweak controls (Leva) for terrain, vegetation, wind, trail, and visuals
