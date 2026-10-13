import { activeProfile } from "./active.ts";
import { RELEASE_CHANNEL } from "./release-channel.ts";

/** Runtime downloads follow the same profile/branch as its desktop build. */
export const SERVER_RELEASE_PROFILE = activeProfile.id;
export const SERVER_RELEASE_CHANNEL = RELEASE_CHANNEL ?? activeProfile.id;
export const SERVER_RELEASE_REPOSITORY = activeProfile.updateFeed.repository;
