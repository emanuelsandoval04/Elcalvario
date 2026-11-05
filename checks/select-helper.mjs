import assert from 'node:assert/strict'

// Exercise the visible picker, including the actual option click, instead of
// assigning directly to the hidden form control.
export async function pickOption(control, choice) {
  const label = await control.evaluate((button, choice) => {
    const options = [...button.closest('.app-select').querySelector('select').options]
    const option = options.find(option => typeof choice === 'object' ? option.label === choice.label : option.value === String(choice))
    return option?.label
  }, choice)
  assert.notEqual(label, undefined, `Missing option: ${JSON.stringify(choice)}`)
  await control.click()
  await control.page().getByRole('dialog').getByRole('option', { name: label, exact: true }).click()
}
