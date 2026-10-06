export type RecentProject =
  | {
      id: string;
      lastOpenedAt: string;
      status: "available";
      name: string;
      url: string;
      avatarColorIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }
  | { id: string; lastOpenedAt: string; status: "missing" };

export interface HomeService {
  listRecent(): Promise<RecentProject[]>;
  removeRecent(projectId: string): Promise<void>;
}

export class HomeServiceError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INTERNAL") {
    super(code);
    this.name = "HomeServiceError";
  }
}
