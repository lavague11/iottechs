// Default AI prompts for the site-survey tool. These are the fallbacks; an admin can
// override either one from the survey tool (stored in app_secrets as SURVEY_PROMPT_AERIAL
// / SURVEY_PROMPT_FLOORPLAN, read via secretValue). Reset = delete the override → this text.

// Enhance (aerial): light cleanup ONLY. It must never invent structures (a pool, an
// addition, a building) — cleanup landscaping and fill capture errors, nothing more.
export const DEFAULT_AERIAL =
  "This is a real straight-down aerial photograph of a property. Return a photorealistic aerial photo — not an illustration, render, painting, 3D render, map graphic or cartoon. Your ONLY job is light cleanup: reduce noise and JPEG compression blocking, sharpen slightly, repair stitch seams and blurred patches, and even out harsh lighting while keeping natural daylight, real photographic grain and soft realistic shadows. You may tidy landscaping cosmetically — make existing lawn a healthy even green, remove small brown or bare patches, and make existing beds, shrubs, patios, pavers and driveways read a little cleaner and crisper. If part of the frame is black, missing, or clearly a capture error, fill ONLY that area with plain matching ground texture (grass, pavement or roof) that naturally continues the surroundings. CRITICAL — do NOT make structural changes: never add, remove, move, resize or reshape any structure or object. Do not invent pools, buildings, additions, decks, sheds, driveways, fences, vehicles, or any feature that is not clearly already present. Every roof, wall, driveway, path, fence, tree and vehicle must stay exactly where it is, at the same size, shape and orientation. Keep the framing and every edge exactly as given — no crop, zoom, pan, tilt, rotation or keystone.";

// Floor-plan Generate: turn the labeled sketch into a clean 2D architectural plan.
// The route appends the room labels to the end at call time.
export const DEFAULT_FLOORPLAN =
  "Turn this labeled sketch into a clean, professional architectural floor plan drawing, top-down, black lines on a white background. The faint photo and coloured lines show the layout: convert them into crisp walls, rooms and openings. Keep every room, wall, door and boundary in the same position, proportion and orientation as drawn. Honour the text labels by printing each as a clean name in its space. Draw doors as gaps or swing arcs and walls as double lines. Keep it a precise 2D architectural floor plan — not a 3D render, not perspective, not a photograph. Thin uniform line weight, simple drafting style.";

// Keys under which admin overrides are stored in the vault (app_secrets).
export const PROMPT_KEYS = { aerial: "SURVEY_PROMPT_AERIAL", floorplan: "SURVEY_PROMPT_FLOORPLAN" };
