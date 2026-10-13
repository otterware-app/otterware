# Profile artwork sources

Otter Code's `otter`, `otter-dev` and `otter-nightly` kits remain unchanged.

- `otterware`: approved production kit from the old Otterware branch's
  `assets/otterware`. `Otterware.icns` is also available as `otterware-macos.icns`
  for packaging. The in-app vector comes from that branch's `OtterwareLogo`.
- `mail`: Otter Mail's `apps/desktop/resources/icon.png`, `icon.icns` and
  `icon-dev.icns`; web artwork from `apps/web/public/favicon.png`. Dev PNGs
  are exported from the native dev ICNS.
- `calendar`: Otter Calendar's `assets/otter` kit, retaining its macOS and
  universal PNGs and web exports.
- `drive`: Otter Drive's `apps/web/public/favicon.svg`, the cube mark used by
  its web app. Desktop and raster exports derive from that vector.

Missing raster sizes and ICOs are resized from the source artwork. Missing
ICNS files contain PNG representations at 16, 32, 64, 128, 256, 512 and 1024
pixels. Mail and Calendar have no source SVG mark, so their SVG favicons embed
source PNG artwork. Only Mail supplies a dev variant; all other non-Code
channels reuse production. Nightly reuses production for all four kits.
