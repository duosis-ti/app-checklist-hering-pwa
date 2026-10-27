export type Role = "admin" | "manager" | "operator";
export type AnswerValue = "C" | "NC" | "NA";
export type SyncStatus = "pending" | "syncing" | "synced" | "error";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  storeId: string | null;
  storeName: string | null;
}
export interface Session {
  token: string;
  user: User;
}
export interface TemplateItem {
  id: string;
  description: string;
  order: number;
  required: boolean;
}
export interface Template {
  id: string;
  name: string;
  description: string;
  role: "operator" | "manager";
  version: number;
  active: boolean;
  items: TemplateItem[];
}
export interface PhotoMeta {
  id: string;
  contentType: string;
  size: number;
  url?: string;
}
export interface Answer {
  id: string;
  itemId: string;
  value: AnswerValue | null;
  observation: string;
  photos: PhotoMeta[];
}
export interface Execution {
  id: string;
  template: Template;
  storeId: string;
  userId: string;
  userName: string;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  answers: Answer[];
  syncStatus: SyncStatus;
  syncError?: string;
}
export interface ActionPlan {
  id: string;
  responseId: string;
  executionId: string;
  storeId: string;
  description: string;
  responsibleId: string;
  responsibleName: string;
  dueAt: string;
  status: "open" | "in_progress" | "completed";
  version: number;
  completedAt: string | null;
  photos: PhotoMeta[];
  sourcePhotos?: PhotoMeta[];
}
export interface UploadTicket {
  photoId: string;
  url: string;
  headers?: Record<string, string>;
}
export interface PrepareResult {
  uploads: UploadTicket[];
  synced: boolean;
}
export function scoreAnswers(answers: Pick<Answer, "value">[]): number | null {
  const applicable = answers.filter((a) => a.value === "C" || a.value === "NC");
  return applicable.length
    ? Math.round(
        (applicable.filter((a) => a.value === "C").length / applicable.length) *
          10000,
      ) / 100
    : null;
}
export function executionErrors(execution: Execution): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of execution.template.items) {
    const answer = execution.answers.find((a) => a.itemId === item.id);
    if (item.required && !answer?.value)
      errors[item.id] = "Responda este item para finalizar.";
    else if (answer?.value === "NC" && !answer.photos.length)
      errors[item.id] = "Adicione uma foto da não conformidade.";
  }
  return errors;
}
