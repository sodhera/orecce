export interface ReccesSlide {
  slideNumber: number;
  type: string;
  text: string;
}

export interface ReccesPost {
  theme: string;
  postType: string;
  slides: ReccesSlide[];
}

export interface ReccesEssayDocument {
  essayId: string;
  sourceTitle: string;
  posts: ReccesPost[];
  updatedAtMs?: number;
}

export interface ReccesResolvedPost {
  id: string;
  authorId: string;
  essayId: string;
  postIndex: number;
  theme: string;
  postType: string;
  slides: ReccesSlide[];
  fullText: string;
}

export interface ReccesRepository {
  listEssayDocuments(authorId: string): Promise<ReccesEssayDocument[]>;
  getPostById(postId: string): Promise<ReccesResolvedPost | null>;
}
