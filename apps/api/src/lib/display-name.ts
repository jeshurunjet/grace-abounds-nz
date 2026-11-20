import { DELETED_USER_LABEL } from '@grace-abounds/validation';

/*
 * How staff see a person (Phase 5C): a deleted account (kept for 30 days
 * before it is purged) shows as "Deleted user", with no contact details.
 */
type Person = {
  name: string | null;
  email: string;
  status?: string;
  phone?: string;
};

export const isDeleted = (person: { status?: string }) =>
  person.status === 'DELETION_PENDING';

export function personName(person: Person) {
  if (isDeleted(person)) return DELETED_USER_LABEL;
  return person.name?.trim() || person.email;
}

export function personContact(person: Person) {
  if (isDeleted(person)) return { email: '', phone: '' };
  return { email: person.email, phone: person.phone ?? '' };
}

type Client = {
  accountDeletion: {
    findMany: (args: {
      where: { userId: { in: string[] } };
      select: { userId: true; purgeAfter: true };
    }) => Promise<{ userId: string; purgeAfter: Date }[]>;
  };
};

/**
 * When each deleted account among these records is purged (its canonical
 * deletion record), so a kept record shows when it is really removed.
 */
export async function purgeDates(
  client: Client,
  rows: { userId: string; user: { status?: string } }[],
) {
  const ids = [
    ...new Set(
      rows.filter((row) => isDeleted(row.user)).map((row) => row.userId),
    ),
  ];
  const found = ids.length
    ? await client.accountDeletion.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, purgeAfter: true },
      })
    : [];
  return new Map(
    found.map((row) => [row.userId, row.purgeAfter.toISOString()]),
  );
}
