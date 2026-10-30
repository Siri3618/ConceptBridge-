/** Fictional, stable demo identities. Rolls and authentication stay independent of display names. */
export const demoStudentNames = [
  'Aarav Sharma', 'Ananya Reddy', 'Sai Charan', 'Sravya Konda', 'Aditya Varma',
  'Keerthana Rao', 'Rohit Kumar', 'Nikhil Reddy', 'Pooja Sharma', 'Harsha Vardhan',
  'Manasa Goud', 'Vamsi Krishna', 'Kavya Nair', 'Akhil Raju', 'Meghana Rao',
  'Sandeep Kumar', 'Divya Sri', 'Pranav Varma', 'Lahari Reddy', 'Tejaswini',
  'Abhinav', 'Bhavana', 'Charitha', 'Dhanush', 'Eshwar', 'Gayathri', 'Hemanth',
  'Ishita', 'Jyothi', 'Karthik', 'Lasya', 'Madhav', 'Navya', 'Praveen',
  'Rakshitha', 'Sushanth', 'Tanvi', 'Uday', 'Vaishnavi', 'Yashwanth',
] as const;

export function demoStudentName(rollNo: string): string | undefined {
  const roll = Number(rollNo);
  return Number.isInteger(roll) && roll >= 1 && roll <= demoStudentNames.length
    ? demoStudentNames[roll - 1]
    : undefined;
}
