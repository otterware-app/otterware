import { OTTERWARE_RELEASE_REPOSITORY } from "./profile.ts";
import { RELEASE_CHANNEL } from "./release-channel.ts";

/** Channel releases use one generic latest manifest inside a profile-specific URL. */
export function releaseFeed(channel = RELEASE_CHANNEL) {
  if (!channel) return undefined;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(channel)) throw new Error("Invalid release feed channel");
  return {
    provider: "generic" as const,
    url: `https://github.com/${OTTERWARE_RELEASE_REPOSITORY}/releases/download/channel-${channel}/`,
    channel: "latest",
  };
}

export function releaseUpdaterChannel(channel: string) {
  return RELEASE_CHANNEL ? "latest" : channel;
}

/** A channel build's feed is pinned, so the shared latest/nightly setting must not drop its releases. */
export function releaseFeedServesChannel(
  updateChannel: string,
  selectedChannel: string,
  channel = RELEASE_CHANNEL,
) {
  return Boolean(channel) || updateChannel === selectedChannel;
}
