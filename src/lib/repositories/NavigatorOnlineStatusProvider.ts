import type { OnlineStatusProvider } from "#/core/interfaces/OnlineStatusProvider";

export class NavigatorOnlineStatusProvider implements OnlineStatusProvider {
  isOnline(): boolean {
    return navigator.onLine;
  }
}
