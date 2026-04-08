### In the 'Usage' section:
Update the JSON filtering example to be more inclusive:

bounty-radar --json | jq '.[] | select(.amount | test("\\$[0-9]+k?"))'

### In the 'Output' section:
Update the date to a current placeholder:

Platform: algora │ Comments: 4 │ Created: 2024-05-20