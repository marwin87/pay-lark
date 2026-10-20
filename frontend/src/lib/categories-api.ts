import { apiFetch } from "./api";

export interface Category {
  id: number;
  name: string;
  slug: string | null;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_archived: boolean;
  in_use?: boolean; // a bill uses it: can only be archived (set by the list endpoint)
}

export interface CategoryCreate {
  name: string;
  color: string;
}

export type CategoryUpdate = Partial<CategoryCreate>;

export function fetchCategories(includeArchived = false): Promise<Category[]> {
  const qs = includeArchived ? "?include_archived=true" : "";
  return apiFetch<Category[]>(`/categories${qs}`);
}

export function createCategory(data: CategoryCreate): Promise<Category> {
  return apiFetch<Category>("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: number, data: CategoryUpdate): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: number): Promise<void> {
  return apiFetch<void>(`/categories/${id}`, { method: "DELETE" });
}

export function archiveCategory(id: number): Promise<void> {
  return apiFetch<void>(`/categories/${id}/archive`, { method: "POST" });
}

export function unarchiveCategory(id: number): Promise<void> {
  return apiFetch<void>(`/categories/${id}/unarchive`, { method: "POST" });
}
