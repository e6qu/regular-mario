export type SemanticUiNode = {
  readonly role: string;
  readonly label: string;
  readonly action?: string;
  readonly value?: string;
  readonly children: readonly SemanticUiNode[];
};
