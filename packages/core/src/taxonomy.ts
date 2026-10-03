import { msg, tr } from './i18n';
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
    label: msg('Family'),
    plural: msg('Family'),
    group: 'personal',
    primary: true,
    roleQuestion: msg("{name}'s place in your family?"),
    asksOrganization: false,
  },
  friend: {
    id: 'friend',
    label: msg('Friend'),
    plural: msg('Friends'),
    group: 'personal',
    primary: true,
    roleQuestion: msg('What kind of friend?'),
    asksOrganization: false,
  },
  acquaintance: {
    id: 'acquaintance',
    label: msg('Acquaintance'),
    plural: msg('Acquaintances'),
    group: 'personal',
    primary: false,
    roleQuestion: msg('How did you meet {name}?'),
    asksOrganization: false,
  },
  work: {
    id: 'work',
    label: msg('Work'),
    plural: msg('Work'),
    group: 'professional',
    primary: true,
    roleQuestion: msg("{name}'s role?"),
    asksOrganization: true,
  },
  customer: {
    id: 'customer',
    label: msg('Customer'),
    plural: msg('Customers'),
    group: 'professional',
    primary: true,
    roleQuestion: msg("{name}'s role?"),
    asksOrganization: true,
  },
  vendor: {
    id: 'vendor',
    label: msg('Vendor'),
    plural: msg('Vendors'),
    group: 'professional',
    primary: true,
    roleQuestion: msg("{name}'s role?"),
    asksOrganization: true,
  },
  service_provider: {
    id: 'service_provider',
    label: msg('Service provider'),
    plural: msg('Service providers'),
    group: 'professional',
    primary: false,
    roleQuestion: msg('What does {name} do for you?'),
    asksOrganization: true,
  },
  professional: {
    id: 'professional',
    label: msg('Professional'),
    plural: msg('Professionals'),
    group: 'professional',
    primary: true,
    roleQuestion: msg("{name}'s profession?"),
    asksOrganization: true,
  },
  community: {
    id: 'community',
    label: msg('Community'),
    plural: msg('Community'),
    group: 'collective',
    primary: false,
    roleQuestion: msg("{name}'s role in the community?"),
    asksOrganization: true,
  },
  organization: {
    id: 'organization',
    label: msg('Organization'),
    plural: msg('Organizations'),
    group: 'collective',
    primary: false,
    roleQuestion: msg("{name}'s role?"),
    asksOrganization: true,
  },
  public: {
    id: 'public',
    label: msg('Public'),
    plural: msg('Public'),
    group: 'collective',
    primary: false,
    roleQuestion: msg('Who is {name}?'),
    asksOrganization: false,
  },
  other: {
    id: 'other',
    label: msg('Other'),
    plural: msg('Other'),
    group: 'fallback',
    primary: true,
    roleQuestion: msg('How would you describe {name}?'),
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
    r('parent', msg('Parent'), msg('Parents'), { quick: true, endable: false }),
    r('child', msg('Child'), msg('Children'), { quick: true, endable: false }),
    r('sibling', msg('Sibling'), msg('Siblings'), { quick: true, endable: false }),
    r('partner', msg('Partner'), msg('Partners'), { quick: true }),
    r('spouse', msg('Spouse'), msg('Spouses'), { quick: true }),
    r('grandparent', msg('Grandparent'), msg('Grandparents'), { endable: false }),
    r('grandchild', msg('Grandchild'), msg('Grandchildren'), { endable: false }),
    r('relative', msg('Relative'), msg('Relatives'), { quick: true, endable: false }),
    r('guardian', msg('Guardian'), msg('Guardians')),
    r('step_family', msg('Step-family'), msg('Step-family')),
    r('in_law', msg('In-law'), msg('In-laws')),
    r('chosen_family', msg('Chosen family'), msg('Chosen family'), { endable: false }),
    r('mother', msg('Mother'), msg('Mothers'), { gendered: true, endable: false }),
    r('father', msg('Father'), msg('Fathers'), { gendered: true, endable: false }),
    r('sister', msg('Sister'), msg('Sisters'), { gendered: true, endable: false }),
    r('brother', msg('Brother'), msg('Brothers'), { gendered: true, endable: false }),
    r('daughter', msg('Daughter'), msg('Daughters'), { gendered: true, endable: false }),
    r('son', msg('Son'), msg('Sons'), { gendered: true, endable: false }),
    r('wife', msg('Wife'), msg('Wives'), { gendered: true }),
    r('husband', msg('Husband'), msg('Husbands'), { gendered: true }),
    r('grandmother', msg('Grandmother'), msg('Grandmothers'), { gendered: true, endable: false }),
    r('grandfather', msg('Grandfather'), msg('Grandfathers'), { gendered: true, endable: false }),
    r('aunt', msg('Aunt'), msg('Aunts'), { gendered: true, endable: false }),
    r('uncle', msg('Uncle'), msg('Uncles'), { gendered: true, endable: false }),
    r('niece', msg('Niece'), msg('Nieces'), { gendered: true, endable: false }),
    r('nephew', msg('Nephew'), msg('Nephews'), { gendered: true, endable: false }),
    r('cousin', msg('Cousin'), msg('Cousins'), { endable: false }),
  ],
  friend: [
    r('friend', msg('Friend'), msg('Friends'), { quick: true }),
    r('close_friend', msg('Close friend'), msg('Close friends'), { quick: true }),
    r('best_friend', msg('Best friend'), msg('Best friends')),
    r('childhood_friend', msg('Childhood friend'), msg('Childhood friends')),
    r('school_friend', msg('School friend'), msg('School friends'), { quick: true }),
    r('university_friend', msg('University friend'), msg('University friends')),
    r('neighbor', msg('Neighbor'), msg('Neighbors'), { quick: true }),
    r('roommate', msg('Roommate'), msg('Roommates')),
  ],
  acquaintance: [
    r('acquaintance', msg('Acquaintance'), msg('Acquaintances'), { quick: true }),
    r('friend_of_friend', msg('Friend of a friend'), msg('Friends of friends'), { quick: true }),
    r('met_at_event', msg('Met at an event'), msg('People met at events'), { quick: true }),
    r('neighbor', msg('Neighbor'), msg('Neighbors'), { quick: true }),
  ],
  work: [
    r('manager', msg('Manager'), msg('Managers'), { quick: true }),
    r('colleague', msg('Colleague'), msg('Colleagues'), { quick: true }),
    r('direct_report', msg('Direct report'), msg('Direct reports'), { quick: true }),
    r('hr', msg('HR'), msg('HR'), { quick: true }),
    r('partner', msg('Partner'), msg('Partners'), { quick: true }),
    r('founder', msg('Founder'), msg('Founders')),
    r('executive', msg('Executive'), msg('Executives')),
    r('recruiter', msg('Recruiter'), msg('Recruiters')),
    r('mentor', msg('Mentor'), msg('Mentors')),
    r('mentee', msg('Mentee'), msg('Mentees')),
    r('investor', msg('Investor'), msg('Investors')),
  ],
  customer: [
    r('client', msg('Client'), msg('Clients'), { quick: true }),
    r('customer', msg('Customer'), msg('Customers'), { quick: true }),
    r('account_owner', msg('Account owner'), msg('Account owners'), { quick: true }),
    r('buyer', msg('Buyer'), msg('Buyers'), { quick: true }),
    r('decision_maker', msg('Decision maker'), msg('Decision makers')),
    r('user', msg('User'), msg('Users')),
    r('procurement', msg('Procurement'), msg('Procurement')),
    r('patient', msg('Patient'), msg('Patients')),
    r('student', msg('Student'), msg('Students')),
  ],
  vendor: [
    r('supplier', msg('Supplier'), msg('Suppliers'), { quick: true }),
    r('account_manager', msg('Account manager'), msg('Account managers'), { quick: true }),
    r('contractor', msg('Contractor'), msg('Contractors'), { quick: true }),
    r('delivery_provider', msg('Delivery provider'), msg('Delivery providers'), { quick: true }),
    r('sales_representative', msg('Sales representative'), msg('Sales representatives')),
    r('freelancer', msg('Freelancer'), msg('Freelancers')),
    r('agency', msg('Agency'), msg('Agencies')),
  ],
  service_provider: [
    r('doctor', msg('Doctor'), msg('Doctors'), { quick: true }),
    r('teacher', msg('Teacher'), msg('Teachers'), { quick: true }),
    r('landlord', msg('Landlord'), msg('Landlords'), { quick: true }),
    r('technician', msg('Technician'), msg('Technicians'), { quick: true }),
    r('dentist', msg('Dentist'), msg('Dentists')),
    r('therapist', msg('Therapist'), msg('Therapists')),
    r('tutor', msg('Tutor'), msg('Tutors')),
    r('trainer', msg('Trainer'), msg('Trainers')),
    r('driver', msg('Driver'), msg('Drivers')),
    r('caregiver', msg('Caregiver'), msg('Caregivers')),
    r('real_estate_agent', msg('Real estate agent'), msg('Real estate agents')),
    r('insurance_agent', msg('Insurance agent'), msg('Insurance agents')),
    r('bank_advisor', msg('Bank advisor'), msg('Bank advisors')),
  ],
  professional: [
    r('lawyer', msg('Lawyer'), msg('Lawyers'), { quick: true }),
    r('accountant', msg('Accountant'), msg('Accountants'), { quick: true }),
    r('consultant', msg('Consultant'), msg('Consultants'), { quick: true }),
    r('doctor', msg('Doctor'), msg('Doctors'), { quick: true }),
    r('advisor', msg('Advisor'), msg('Advisors'), { quick: true }),
    r('broker', msg('Broker'), msg('Brokers')),
    r('architect', msg('Architect'), msg('Architects')),
    r('engineer', msg('Engineer'), msg('Engineers')),
    r('designer', msg('Designer'), msg('Designers')),
    r('coach', msg('Coach'), msg('Coaches')),
  ],
  community: [
    r('member', msg('Member'), msg('Members'), { quick: true }),
    r('organizer', msg('Organizer'), msg('Organizers'), { quick: true }),
    r('volunteer', msg('Volunteer'), msg('Volunteers'), { quick: true }),
    r('classmate', msg('Classmate'), msg('Classmates'), { quick: true }),
    r('teammate', msg('Teammate'), msg('Teammates')),
    r('fellow_parent', msg('Fellow parent'), msg('Fellow parents')),
  ],
  organization: [
    r('representative', msg('Representative'), msg('Representatives'), { quick: true }),
    r('support', msg('Support'), msg('Support'), { quick: true }),
    r('sales', msg('Sales'), msg('Sales'), { quick: true }),
    r('official', msg('Official'), msg('Officials')),
  ],
  public: [
    r('public_figure', msg('Public figure'), msg('Public figures'), { quick: true }),
    r('creator', msg('Creator'), msg('Creators'), { quick: true }),
    r('public_service', msg('Public service'), msg('Public services'), { quick: true }),
    r('journalist', msg('Journalist'), msg('Journalists')),
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
  // A label the person wrote is theirs as written; a role's or a sphere's is shown in their language.
  const role = findRole(input.sphere, input.role);
  const base = input.roleLabel?.trim() || (role ? tr(role.label) : undefined);
  let head = base ?? tr(SPHERE_DEFS[input.sphere].label);
  if (input.status === 'ended')
    head = tr('Former {role}', { role: `${head.charAt(0).toLowerCase()}${head.slice(1)}` });
  return input.orgName ? `${head} · ${input.orgName}` : head;
}

// ---------------------------------------------------------------------------------------------
// Complementary relationships (PRD §53). Two people may classify each other differently;
// Caime recognises when the two views fit together. Only ever evaluated between two *shared*
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
 * - `different`: the views don't fit together; Caime says nothing.
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

/**
 * A relationship Caime thinks someone may be to you (PRD §12), as it's offered: "Sarah may be
 * your colleague at DATA C". An offer, never a fact.
 */
export function relationshipOfferText(
  name: string,
  offer: { sphere?: string | null; role?: string | null; orgName?: string | null },
): string {
  const sphere = (offer.sphere ?? null) as Sphere | null;
  const at = offer.orgName ? tr(' at {orgName}', { orgName: offer.orgName }) : '';
  if (!sphere || !(sphere in SPHERE_DEFS))
    return tr('{name} may be someone you know{at}', { name, at });
  const role = findRole(sphere, offer.role);
  if (role)
    return tr('{name} may be your {toLowerCase}{at}', {
      name,
      toLowerCase: tr(role.label).toLowerCase(),
      at,
    });
  if (sphere === 'family') return tr('{name} may be family', { name });
  if (sphere === 'work') return tr('{name} may be someone you work with{at}', { name, at });
  // The spheres that name a group are said of a person: never "may be a community".
  if (sphere === 'community')
    return tr('{name} may be someone from your community{at}', { name, at });
  if (sphere === 'organization')
    return tr('{name} may be someone from {orgName}', {
      name,
      orgName: offer.orgName || tr('an organization'),
    });
  if (sphere === 'public' || sphere === 'other')
    return tr('{name} may be someone you know{at}', { name, at });
  const label = tr(SPHERE_DEFS[sphere].label).toLowerCase();
  return tr('{name} may be {an} {label}{at}', {
    name,
    an: /^[aeiou]/.test(label) ? 'an' : 'a',
    label,
    at,
  });
}
