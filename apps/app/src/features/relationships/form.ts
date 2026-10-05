/**
 * The relationship form's state and what it sends (R3, R9): small and pure, so the sheets that
 * hold a form (connect, invite) keep it without loading the picker, which they take lazily.
 */
import { SPHERE_DEFS, type Sphere } from '@caime/core/taxonomy';

export interface RelationshipDraft {
  sphere: Sphere;
  role: string | null;
  roleLabel: string | null;
  orgName: string | null;
  shared: boolean;
}

export interface FormState {
  sphere: Sphere | null;
  role: string | null;
  roleLabel: string;
  orgName: string;
  shared: boolean;
}

export function initialForm(current?: Partial<RelationshipDraft> | null): FormState {
  return {
    sphere: current?.sphere ?? null,
    role: current?.role ?? null,
    roleLabel: current?.roleLabel ?? '',
    orgName: current?.orgName ?? '',
    shared: current?.shared ?? false,
  };
}

export function toDraft(f: FormState): RelationshipDraft | null {
  if (!f.sphere) return null;
  return {
    sphere: f.sphere,
    role: f.roleLabel.trim() ? null : f.role,
    roleLabel: f.roleLabel.trim() || null,
    orgName: SPHERE_DEFS[f.sphere].asksOrganization ? f.orgName.trim() || null : null,
    shared: f.shared,
  };
}
