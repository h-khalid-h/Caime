/**
 * The relationship taxonomy: Sphere → Role → Context (PRD §7–§9).
 *
 * "Simple for the user, structured underneath" (PRD §6): the first-connection flow shows seven
 * spheres and a handful of roles; everything else is one tap further. Roles are inclusive by
 * construction — gender-neutral roles come first, gendered ones are available, and every sphere
 * accepts custom roles (PRODUCT-REVIEW R28).
 */

export const SPHERES = [
  'family',
  'friend',
  'acquaintance',
  'work',
  'customer',
  'vendor',
  'service_provider',
  'professional',
  'community',
  'organization',
  'public',
  'other',
] as const;

export type Sphere = (typeof SPHERES)[number];

export type SphereGroup = 'personal' | 'professional' | 'collective' | 'fallback';

export interface SphereDef {
  id: Sphere;
  label: string;
  /** Plural used in search ("my customers") and headings. */
  plural: string;
  group: SphereGroup;
  /** Shown directly in "How do you know …?" (PRD §11, W1); the rest sit behind "More". */
  primary: boolean;
  /** Question asked for the role step. `{name}` is replaced with the person's name. */
  roleQuestion: string;
  /** Whether the "Where?" (organization) step is offered. */
  asksOrganization: boolean;
}

export const SPHERE_DEFS: Record<Sphere, SphereDef> = {
  family: {
    id: 'family',
    label: 'Family',
    plural: 'Family',
    group: 'personal',
    primary: true,
    roleQuestion: "{name}'s place in your family?",
    asksOrganization: false,
  },
  friend: {
    id: 'friend',
    label: 'Friend',
    plural: 'Friends',
    group: 'personal',
    primary: true,
    roleQuestion: 'What kind of friend?',
    asksOrganization: false,
  },
  acquaintance: {
    id: 'acquaintance',
    label: 'Acquaintance',
    plural: 'Acquaintances',
    group: 'personal',
    primary: false,
    roleQuestion: 'How did you meet {name}?',
    asksOrganization: false,
  },
  work: {
    id: 'work',
    label: 'Work',
    plural: 'Work',
    group: 'professional',
    primary: true,
    roleQuestion: "{name}'s role?",
    asksOrganization: true,
  },
  customer: {
    id: 'customer',
    label: 'Customer',
    plural: 'Customers',
    group: 'professional',
    primary: true,
    roleQuestion: "{name}'s role?",
    asksOrganization: true,
  },
  vendor: {
    id: 'vendor',
    label: 'Vendor',
    plural: 'Vendors',
    group: 'professional',
    primary: true,
    roleQuestion: "{name}'s role?",
    asksOrganization: true,
  },
  service_provider: {
    id: 'service_provider',
    label: 'Service provider',
    plural: 'Service providers',
    group: 'professional',
    primary: false,
    roleQuestion: 'What does {name} do for you?',
    asksOrganization: true,
  },
  professional: {
    id: 'professional',
    label: 'Professional',
    plural: 'Professionals',
    group: 'professional',
    primary: true,
    roleQuestion: "{name}'s profession?",
    asksOrganization: true,
  },
  community: {
    id: 'community',
    label: 'Community',
    plural: 'Community',
    group: 'collective',
    primary: false,
    roleQuestion: "{name}'s role in the community?",
    asksOrganization: true,
  },
  organization: {
    id: 'organization',
    label: 'Organization',
    plural: 'Organizations',
    group: 'collective',
    primary: false,
    roleQuestion: "{name}'s role?",
    asksOrganization: true,
  },
  public: {
    id: 'public',
    label: 'Public',
    plural: 'Public',
    group: 'collective',
    primary: false,
    roleQuestion: 'Who is {name}?',
    asksOrganization: false,
  },
  other: {
    id: 'other',
    label: 'Other',
    plural: 'Other',
    group: 'fallback',
    primary: true,
    roleQuestion: 'How would you describe {name}?',
    asksOrganization: false,
  },
};

export interface RoleDef {
  id: string;
  label: string;
  plural: string;
  /** Shown as a chip in the role step; others are behind "More". */
  quick?: boolean;
  /** Gendered variant of a neutral role — listed after the neutral ones. */
  gendered?: boolean;
  /** Ending this relationship makes sense ("Former manager"); for most family roles it does not. */
  endable?: boolean;
}

function r(id: string, label: string, plural: string, opts: Partial<RoleDef> = {}): RoleDef {
  return { id, label, plural, endable: true, ...opts };
}

export const ROLES: Record<Sphere, RoleDef[]> = {
  family: [
    r('parent', 'Parent', 'Parents', { quick: true, endable: false }),
    r('child', 'Child', 'Children', { quick: true, endable: false }),
    r('sibling', 'Sibling', 'Siblings', { quick: true, endable: false }),
    r('partner', 'Partner', 'Partners', { quick: true }),
    r('spouse', 'Spouse', 'Spouses', { quick: true }),
    r('grandparent', 'Grandparent', 'Grandparents', { endable: false }),
    r('grandchild', 'Grandchild', 'Grandchildren', { endable: false }),
    r('relative', 'Relative', 'Relatives', { quick: true, endable: false }),
    r('guardian', 'Guardian', 'Guardians'),
    r('step_family', 'Step-family', 'Step-family'),
    r('in_law', 'In-law', 'In-laws'),
    r('chosen_family', 'Chosen family', 'Chosen family', { endable: false }),
    r('mother', 'Mother', 'Mothers', { gendered: true, endable: false }),
    r('father', 'Father', 'Fathers', { gendered: true, endable: false }),
    r('sister', 'Sister', 'Sisters', { gendered: true, endable: false }),
    r('brother', 'Brother', 'Brothers', { gendered: true, endable: false }),
    r('daughter', 'Daughter', 'Daughters', { gendered: true, endable: false }),
    r('son', 'Son', 'Sons', { gendered: true, endable: false }),
    r('wife', 'Wife', 'Wives', { gendered: true }),
    r('husband', 'Husband', 'Husbands', { gendered: true }),
    r('grandmother', 'Grandmother', 'Grandmothers', { gendered: true, endable: false }),
    r('grandfather', 'Grandfather', 'Grandfathers', { gendered: true, endable: false }),
    r('aunt', 'Aunt', 'Aunts', { gendered: true, endable: false }),
    r('uncle', 'Uncle', 'Uncles', { gendered: true, endable: false }),
    r('niece', 'Niece', 'Nieces', { gendered: true, endable: false }),
    r('nephew', 'Nephew', 'Nephews', { gendered: true, endable: false }),
    r('cousin', 'Cousin', 'Cousins', { endable: false }),
  ],
  friend: [
    r('friend', 'Friend', 'Friends', { quick: true }),
    r('close_friend', 'Close friend', 'Close friends', { quick: true }),
    r('best_friend', 'Best friend', 'Best friends'),
    r('childhood_friend', 'Childhood friend', 'Childhood friends'),
    r('school_friend', 'School friend', 'School friends', { quick: true }),
    r('university_friend', 'University friend', 'University friends'),
    r('neighbor', 'Neighbor', 'Neighbors', { quick: true }),
    r('roommate', 'Roommate', 'Roommates'),
  ],
  acquaintance: [
    r('acquaintance', 'Acquaintance', 'Acquaintances', { quick: true }),
    r('friend_of_friend', 'Friend of a friend', 'Friends of friends', { quick: true }),
    r('met_at_event', 'Met at an event', 'People met at events', { quick: true }),
    r('neighbor', 'Neighbor', 'Neighbors', { quick: true }),
  ],
  work: [
    r('manager', 'Manager', 'Managers', { quick: true }),
    r('colleague', 'Colleague', 'Colleagues', { quick: true }),
    r('direct_report', 'Direct report', 'Direct reports', { quick: true }),
    r('hr', 'HR', 'HR', { quick: true }),
    r('partner', 'Partner', 'Partners', { quick: true }),
    r('founder', 'Founder', 'Founders'),
    r('executive', 'Executive', 'Executives'),
    r('recruiter', 'Recruiter', 'Recruiters'),
    r('mentor', 'Mentor', 'Mentors'),
    r('mentee', 'Mentee', 'Mentees'),
    r('investor', 'Investor', 'Investors'),
  ],
  customer: [
    r('client', 'Client', 'Clients', { quick: true }),
    r('customer', 'Customer', 'Customers', { quick: true }),
    r('account_owner', 'Account owner', 'Account owners', { quick: true }),
    r('buyer', 'Buyer', 'Buyers', { quick: true }),
    r('decision_maker', 'Decision maker', 'Decision makers'),
    r('user', 'User', 'Users'),
    r('procurement', 'Procurement', 'Procurement'),
    r('patient', 'Patient', 'Patients'),
    r('student', 'Student', 'Students'),
  ],
  vendor: [
    r('supplier', 'Supplier', 'Suppliers', { quick: true }),
    r('account_manager', 'Account manager', 'Account managers', { quick: true }),
    r('contractor', 'Contractor', 'Contractors', { quick: true }),
    r('delivery_provider', 'Delivery provider', 'Delivery providers', { quick: true }),
    r('sales_representative', 'Sales representative', 'Sales representatives'),
    r('freelancer', 'Freelancer', 'Freelancers'),
    r('agency', 'Agency', 'Agencies'),
  ],
  service_provider: [
    r('doctor', 'Doctor', 'Doctors', { quick: true }),
    r('teacher', 'Teacher', 'Teachers', { quick: true }),
    r('landlord', 'Landlord', 'Landlords', { quick: true }),
    r('technician', 'Technician', 'Technicians', { quick: true }),
    r('dentist', 'Dentist', 'Dentists'),
    r('therapist', 'Therapist', 'Therapists'),
    r('tutor', 'Tutor', 'Tutors'),
    r('trainer', 'Trainer', 'Trainers'),
    r('driver', 'Driver', 'Drivers'),
    r('caregiver', 'Caregiver', 'Caregivers'),
    r('real_estate_agent', 'Real estate agent', 'Real estate agents'),
    r('insurance_agent', 'Insurance agent', 'Insurance agents'),
    r('bank_advisor', 'Bank advisor', 'Bank advisors'),
  ],
  professional: [
    r('lawyer', 'Lawyer', 'Lawyers', { quick: true }),
    r('accountant', 'Accountant', 'Accountants', { quick: true }),
    r('consultant', 'Consultant', 'Consultants', { quick: true }),
    r('doctor', 'Doctor', 'Doctors', { quick: true }),
    r('advisor', 'Advisor', 'Advisors', { quick: true }),
    r('broker', 'Broker', 'Brokers'),
    r('architect', 'Architect', 'Architects'),
    r('engineer', 'Engineer', 'Engineers'),
    r('designer', 'Designer', 'Designers'),
    r('coach', 'Coach', 'Coaches'),
  ],
  community: [
    r('member', 'Member', 'Members', { quick: true }),
    r('organizer', 'Organizer', 'Organizers', { quick: true }),
    r('volunteer', 'Volunteer', 'Volunteers', { quick: true }),
    r('classmate', 'Classmate', 'Classmates', { quick: true }),
    r('teammate', 'Teammate', 'Teammates'),
    r('fellow_parent', 'Fellow parent', 'Fellow parents'),
  ],
  organization: [
    r('representative', 'Representative', 'Representatives', { quick: true }),
    r('support', 'Support', 'Support', { quick: true }),
    r('sales', 'Sales', 'Sales', { quick: true }),
    r('official', 'Official', 'Officials'),
  ],
  public: [
    r('public_figure', 'Public figure', 'Public figures', { quick: true }),
    r('creator', 'Creator', 'Creators', { quick: true }),
    r('public_service', 'Public service', 'Public services', { quick: true }),
    r('journalist', 'Journalist', 'Journalists'),
  ],
  other: [],
};

export function isSphere(value: unknown): value is Sphere {
  return typeof value === 'string' && (SPHERES as readonly string[]).includes(value);
}

export function primarySpheres(): SphereDef[] {
  return SPHERES.map((s) => SPHERE_DEFS[s]).filter((d) => d.primary);
}

export function secondarySpheres(): SphereDef[] {
  return SPHERES.map((s) => SPHERE_DEFS[s]).filter((d) => !d.primary);
}

export function findRole(sphere: Sphere, roleId: string | null | undefined): RoleDef | undefined {
  if (!roleId) return undefined;
  return ROLES[sphere].find((role) => role.id === roleId);
}

/** Quick roles first (neutral before gendered), then the rest in their listed order. */
export function rolesForPicker(sphere: Sphere): { quick: RoleDef[]; more: RoleDef[] } {
  const all = ROLES[sphere];
  return {
    quick: all.filter((role) => role.quick),
    more: all.filter((role) => !role.quick),
  };
}

export function fillName(template: string, name: string): string {
  return template.replaceAll('{name}', name);
}

/** How a relationship reads: "Manager · DATA C", "Friend", "Former manager · DATA C". */
export function relationshipLabel(input: {
  sphere: Sphere;
  role?: string | null;
  roleLabel?: string | null;
  orgName?: string | null;
  status?: 'active' | 'ended' | 'archived';
}): string {
  const base = input.roleLabel?.trim() || findRole(input.sphere, input.role)?.label;
  let head = base ?? SPHERE_DEFS[input.sphere].label;
  if (input.status === 'ended') head = `Former ${head.charAt(0).toLowerCase()}${head.slice(1)}`;
  return input.orgName ? `${head} · ${input.orgName}` : head;
}

// ---------------------------------------------------------------------------------------------
// Complementary relationships (PRD §53). Two people may classify each other differently;
// Caishy recognises when the two views fit together. Only ever evaluated between two *shared*
// classifications (PRODUCT-REVIEW R6).

export type Fit = 'same' | 'complementary' | 'different';

interface RoleRef {
  sphere: Sphere;
  role?: string | null;
}

/** Normalise gendered family roles to their neutral form for comparison. */
const NEUTRAL: Record<string, string> = {
  mother: 'parent',
  father: 'parent',
  sister: 'sibling',
  brother: 'sibling',
  daughter: 'child',
  son: 'child',
  wife: 'spouse',
  husband: 'spouse',
  grandmother: 'grandparent',
  grandfather: 'grandparent',
  aunt: 'parent_sibling',
  uncle: 'parent_sibling',
  niece: 'sibling_child',
  nephew: 'sibling_child',
};

const INVERSE_PAIRS: Array<[string, string]> = [
  ['family:parent', 'family:child'],
  ['family:grandparent', 'family:grandchild'],
  ['family:parent_sibling', 'family:sibling_child'],
  ['family:guardian', 'family:child'],
  ['work:manager', 'work:direct_report'],
  ['work:mentor', 'work:mentee'],
];

const SYMMETRIC_ROLES = new Set([
  'family:sibling',
  'family:spouse',
  'family:partner',
  'family:cousin',
  'family:relative',
  'family:in_law',
  'family:step_family',
  'family:chosen_family',
  'work:colleague',
  'work:partner',
  'community:member',
  'community:classmate',
  'community:teammate',
  'community:fellow_parent',
]);

/** Spheres that are each other's counterpart: my customer sees me as a vendor or provider. */
const SPHERE_COUNTERPARTS: Record<Sphere, Sphere[]> = {
  family: ['family'],
  friend: ['friend', 'acquaintance'],
  acquaintance: ['acquaintance', 'friend'],
  work: ['work'],
  customer: ['vendor', 'service_provider', 'professional', 'organization'],
  vendor: ['customer'],
  service_provider: ['customer'],
  professional: ['customer'],
  community: ['community'],
  organization: ['customer', 'organization'],
  public: [],
  other: [],
};

function key(ref: RoleRef): string {
  const role = ref.role ? (NEUTRAL[ref.role] ?? ref.role) : '';
  return `${ref.sphere}:${role}`;
}

/**
 * Compare A's classification of B with B's classification of A.
 * - `same`: the relationship is symmetric and both describe it the same way (colleague ↔ colleague).
 * - `complementary`: the two views are the two sides of one relationship (manager ↔ direct report).
 * - `different`: the views don't fit together; Caishy says nothing.
 */
export function relationshipFit(aViewOfB: RoleRef, bViewOfA: RoleRef): Fit {
  const ka = key(aViewOfB);
  const kb = key(bViewOfA);
  if (ka === kb && (SYMMETRIC_ROLES.has(ka) || !aViewOfB.role)) {
    return SPHERE_COUNTERPARTS[aViewOfB.sphere].includes(bViewOfA.sphere) ? 'same' : 'different';
  }
  for (const [x, y] of INVERSE_PAIRS) {
    if ((ka === x && kb === y) || (ka === y && kb === x)) return 'complementary';
  }
  if (aViewOfB.sphere === 'friend' && bViewOfA.sphere === 'friend') return 'same';
  if (aViewOfB.sphere !== bViewOfA.sphere) {
    if (SPHERE_COUNTERPARTS[aViewOfB.sphere].includes(bViewOfA.sphere)) return 'complementary';
    return 'different';
  }
  // Same sphere, different or unset roles: consistent but not a recognised pair.
  if (SPHERE_COUNTERPARTS[aViewOfB.sphere].includes(bViewOfA.sphere)) {
    return !aViewOfB.role || !bViewOfA.role ? 'same' : 'different';
  }
  return 'different';
}

/** Search words that name a relationship: "managers" → work/manager, "customers" → customer. */
export function relationshipFromWord(word: string): { sphere: Sphere; role?: string } | undefined {
  const w = word.trim().toLowerCase();
  if (!w) return undefined;
  for (const sphere of SPHERES) {
    const def = SPHERE_DEFS[sphere];
    if (w === def.label.toLowerCase() || w === def.plural.toLowerCase()) return { sphere };
  }
  for (const sphere of SPHERES) {
    for (const role of ROLES[sphere]) {
      if (w === role.label.toLowerCase() || w === role.plural.toLowerCase()) {
        return { sphere, role: role.id };
      }
    }
  }
  return undefined;
}
