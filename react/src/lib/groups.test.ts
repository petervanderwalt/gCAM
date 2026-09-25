import { expandGroupedSelection, groupIdsForSelection, groupLoopIds, ungroupLoopIds } from './groups';

const loops = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c', groupId: 'old' },
];

test('groups and ungroups selected loops', () => {
    const grouped = groupLoopIds(loops, ['a', 'b'], 'g1');
    expect(grouped.filter((loop) => loop.groupId === 'g1')).toHaveLength(2);
    expect(ungroupLoopIds(grouped, ['g1'])).toEqual(loops);
});

test('group selection expands to all members', () => {
    expect(groupIdsForSelection(loops, ['c'])).toEqual(['old']);
    expect(expandGroupedSelection(loops, ['c'])).toEqual(['c']);
    expect(expandGroupedSelection([...loops, { id: 'd', groupId: 'old' }], ['c'])).toEqual(['c', 'd']);
});
