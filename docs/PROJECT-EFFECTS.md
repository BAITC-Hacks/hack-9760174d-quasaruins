# Project scenery

The engine is the sole source of results and completion quarters. `city-project-effects.js` adds visible scenery when an intervention completes; it does not model traffic, emissions, behavior, construction feasibility or a second points system. Draft construction previews remain the renderer's responsibility. Before view clears effects; pinned Plan A shows its completed effects. The shared animation clock respects pause and reduced motion.

| Project | Completed visual effect |
| --- | --- |
| M1 Bus lanes | Teal treatments and moving buses on mapped roads |
| M2 Smart signals | Roadside signal heads and coordinated green corridor |
| M3 Light rail | New elevated rails, supports, platforms and moving train along an illustrative mapped-road corridor |
| M4 Neighborhood park | Additional safe trees around the project parcel |
| M5 Clean fuel | Pale green overlays on ordinary district houses and soft leaf symbols |
| M6 City greening | Deterministically scattered trees across the five modeled districts |
| M7 School | Book marker reinforcing the school extension |
| M8 Clinic | Medical marker reinforcing the clinic extension |
| M9 Sports hubs | Colored playing court and completion marker |
| M10 Lighting | Roadside lamps and soft warm pools of light |
| M11 Crossings | Zebra markings aligned with source roads |
| M12 Resident requests | Civic completion markers in each modeled district |
| M13 Networks | Blue utility corridor and access points along source roads |
| M14 Utility crews | Moving service vehicles on mapped roads |

The existing mapped LRT is a separate geographic backdrop. M3 illustrates a new intervention and does not claim an approved alignment. Road pieces join only at identical source endpoints; vehicles reflect at a route endpoint instead of crossing a missing link. New trees avoid water, reserved landmark/park/service parcels and ordinary building footprints. Tree distribution is stable across replays.

Repeated road, tree and house geometry uses instancing. Geometry/material caches are owned by the module; removed instances and final module resources are disposed. Tests cover replay gates, all fourteen forms, unmodeled district exclusion, comparison views, pause/disposal and disconnected roads. A separate geometry check exercised every allowed project target against the actual offline map.
