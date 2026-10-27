// Otterware shows the composer context drawer (environment, branch) above the
// composer on the empty-thread hero. Upstream's ComposerSurface shapes the
// drawer for its place below, so these classes mirror that shape vertically.

/** On the Shell: the glass outline flipped, the drawer's inset extension on top. */
export const composerShellDrawerAboveClassName = [
  "before:[clip-path:shape(from_0_calc(100%-16px),curve_to_16px_100%_with_0_calc(100%-7.16px)/7.16px_100%,line_to_calc(100%-16px)_100%,curve_to_100%_calc(100%-16px)_with_calc(100%-7.16px)_100%/100%_calc(100%-7.16px),line_to_100%_calc(var(--chat-composer-context-extension)+16px),curve_to_calc(100%-16px)_var(--chat-composer-context-extension)_with_100%_calc(var(--chat-composer-context-extension)+7.16px)/calc(100%-7.16px)_var(--chat-composer-context-extension),line_to_calc(100%-var(--chat-composer-drawer-inset))_var(--chat-composer-context-extension),line_to_calc(100%-var(--chat-composer-drawer-inset))_16px,curve_to_calc(100%-var(--chat-composer-drawer-inset)-16px)_0_with_calc(100%-var(--chat-composer-drawer-inset))_7.16px/calc(100%-var(--chat-composer-drawer-inset)-7.16px)_0,line_to_calc(var(--chat-composer-drawer-inset)+16px)_0,curve_to_var(--chat-composer-drawer-inset)_16px_with_calc(var(--chat-composer-drawer-inset)+7.16px)_0/var(--chat-composer-drawer-inset)_7.16px,line_to_var(--chat-composer-drawer-inset)_var(--chat-composer-context-extension),line_to_16px_var(--chat-composer-context-extension),curve_to_0_calc(var(--chat-composer-context-extension)+16px)_with_7.16px_var(--chat-composer-context-extension)/0_calc(var(--chat-composer-context-extension)+7.16px),line_to_0_calc(100%-16px),close)]",
  "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bottom-0 not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:top-(--chat-composer-context-extension)",
].join(" ");

/**
 * On the drawer's wrapper: the drawer tucks under the composer's top edge, rounds
 * its top corners and hides its bottom seam. The dark seam shading is drawn for a
 * drawer below; above, it would cross the controls.
 */
export const composerDrawerAboveClassName = [
  "[&_[data-slot=composer-context-strip]]:mt-0 [&_[data-slot=composer-context-strip]]:-mb-4 [&_[data-slot=composer-context-strip]]:pt-1 [&_[data-slot=composer-context-strip]]:pb-5",
  "[&_[data-slot=composer-context-strip]]:before:rounded-t-2xl [&_[data-slot=composer-context-strip]]:before:rounded-b-none",
  "[&_[data-slot=composer-context-strip]]:before:mask-b-from-black [&_[data-slot=composer-context-strip]]:before:mask-t-from-transparent [&_[data-slot=composer-context-strip]]:before:mask-t-from-(position:--spacing-composer-seam) [&_[data-slot=composer-context-strip]]:before:mask-t-to-black [&_[data-slot=composer-context-strip]]:before:mask-t-to-(position:--spacing-composer-seam)",
  "dark:[&_[data-slot=composer-context-strip]]:before:bg-none",
].join(" ");
