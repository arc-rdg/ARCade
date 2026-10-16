// What the HUD occupies at the top and bottom of the view, in view units, so overlays can stay clear.
export const HUD_MARGIN = 8
export const SLOT_W = 34
export const SLOT_H = 22
export const SLOT_GAP = 4
// Y of the boss attack name, the lowest thing in the top HUD, and its text height.
const ATTACK_Y = HUD_MARGIN + 39
const ATTACK_TEXT_H = 11
// The HP and XP bars, the level line, the path dots and the boss texts end above this.
export const HUD_TOP = ATTACK_Y + ATTACK_TEXT_H
// The ability slots and the hint over a spent slot start below this, measured from the bottom edge.
export const HUD_BOTTOM = HUD_MARGIN + SLOT_H + 8
