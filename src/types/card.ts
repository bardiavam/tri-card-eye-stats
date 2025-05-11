
export type CardStatus = 'declined' | 'charged' | '3ds_challenge' | 'unchecked';

export interface CardData {
  id: string;
  number: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  status: CardStatus;
  testedAt: Date;
  userId: string;
}

export interface UserStats {
  id: string;
  username: string;
  liveCardsCount: number;
}

export interface GlobalStats {
  liveCards: number;
  deadCards: number;
  threeDsCards?: number;
  totalCards?: number;
  totalUsers?: number;
  successRate?: string;
}
