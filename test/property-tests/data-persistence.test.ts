/**
 * Property-Based Test: Data Persistence Across Pod Restarts
 * 
 * Feature: jenkins-eks-cluster
 * Property 1: Data Persistence Across Pod Restarts
 * 
 * Validates: Requirements 3.7
 * 
 * This test verifies that data written to Jenkins home directory on EFS
 * persists across pod restarts. The test:
 * 1. Writes random data to Jenkins home directory
 * 2. Restarts the Jenkins controller pod
 * 3. Verifies the data is still present after restart
 * 
 * This property must hold for all possible data values and restart scenarios.
 */

import * as fc from 'fast-check';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper function to execute kubectl commands
async function kubectl(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(`kubectl ${command}`);
    if (stderr && !stderr.includes('Warning')) {
      console.error('kubectl stderr:', stderr);
    }
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`kubectl command failed: ${error.message}`);
  }
}

// Helper function to get Jenkins controller pod name
async function getJenkinsPodName(): Promise<string> {
  const output = await kubectl('get pods -n jenkins -l app=jenkins-controller -o jsonpath="{.items[0].metadata.name}"');
  return output.replace(/"/g, '');
}

// Helper function to write data to Jenkins home directory
async function writeDataToJenkinsHome(podName: string, filename: string, data: string): Promise<void> {
  const command = `exec ${podName} -n jenkins -- sh -c "echo '${data}' > /var/jenkins_home/${filename}"`;
  await kubectl(command);
}

// Helper function to read data from Jenkins home directory
async function readDataFromJenkinsHome(podName: string, filename: string): Promise<string> {
  const command = `exec ${podName} -n jenkins -- cat /var/jenkins_home/${filename}`;
  return await kubectl(command);
}

// Helper function to restart Jenkins controller pod
async function restartJenkinsPod(podName: string): Promise<void> {
  // Delete the pod - StatefulSet will recreate it
  await kubectl(`delete pod ${podName} -n jenkins --grace-period=30`);
  
  // Wait for new pod to be ready
  await kubectl('wait --for=condition=ready pod -l app=jenkins-controller -n jenkins --timeout=300s');
  
  // Give Jenkins a moment to fully initialize
  await new Promise(resolve => setTimeout(resolve, 10000));
}

describe('Property Test: Data Persistence Across Pod Restarts', () => {
  // Skip if not in integration test environment
  const isIntegrationTest = process.env.RUN_INTEGRATION_TESTS === 'true';
  
  if (!isIntegrationTest) {
    it.skip('Skipping integration test - set RUN_INTEGRATION_TESTS=true to run', () => {});
    return;
  }

  /**
   * Property: Data written to Jenkins home directory persists across pod restarts
   * 
   * For all possible:
   * - filenames (alphanumeric strings)
   * - data content (arbitrary strings)
   * 
   * When:
   * 1. Data is written to Jenkins home directory
   * 2. Jenkins controller pod is restarted
   * 
   * Then:
   * - The data must still be present and unchanged after restart
   */
  it('should persist data across pod restarts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random filename (alphanumeric, 8-16 characters)
        fc.string({ minLength: 8, maxLength: 16, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
        // Generate random data content (printable ASCII, 10-100 characters)
        fc.string({ minLength: 10, maxLength: 100 }),
        async (filename: string, data: string) => {
          // Add .txt extension to filename
          const testFilename = `pbt-test-${filename}.txt`;
          
          console.log(`\n[Property Test] Testing with filename: ${testFilename}`);
          console.log(`[Property Test] Data length: ${data.length} characters`);
          
          // Get current Jenkins pod name
          const podNameBefore = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod before restart: ${podNameBefore}`);
          
          // Write data to Jenkins home directory
          await writeDataToJenkinsHome(podNameBefore, testFilename, data);
          console.log(`[Property Test] Data written to ${testFilename}`);
          
          // Verify data was written correctly
          const dataBeforeRestart = await readDataFromJenkinsHome(podNameBefore, testFilename);
          expect(dataBeforeRestart).toBe(data);
          console.log(`[Property Test] Data verified before restart`);
          
          // Restart Jenkins controller pod
          console.log(`[Property Test] Restarting Jenkins pod...`);
          await restartJenkinsPod(podNameBefore);
          
          // Get new Jenkins pod name
          const podNameAfter = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod after restart: ${podNameAfter}`);
          
          // Verify data persists after restart
          const dataAfterRestart = await readDataFromJenkinsHome(podNameAfter, testFilename);
          console.log(`[Property Test] Data read after restart`);
          
          // Property assertion: Data must be unchanged after restart
          expect(dataAfterRestart).toBe(data);
          console.log(`[Property Test] ✓ Data persisted across restart`);
          
          // Cleanup: Remove test file
          await kubectl(`exec ${podNameAfter} -n jenkins -- rm -f /var/jenkins_home/${testFilename}`);
          console.log(`[Property Test] Cleanup completed`);
        }
      ),
      {
        // Run 100 iterations to test various data and filename combinations
        numRuns: 100,
        // Timeout for each test case (5 minutes to allow for pod restart)
        timeout: 300000,
        // Verbose output for debugging
        verbose: true,
      }
    );
  }, 600000); // 10 minute timeout for entire test suite

  /**
   * Property: Multiple files persist independently across pod restarts
   * 
   * This test verifies that multiple files can be written and all persist
   * independently across pod restarts.
   */
  it('should persist multiple files independently across pod restarts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of 2-5 files with random names and content
        fc.array(
          fc.record({
            filename: fc.string({ minLength: 8, maxLength: 16, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
            data: fc.string({ minLength: 10, maxLength: 100 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (files: Array<{ filename: string; data: string }>) => {
          console.log(`\n[Property Test] Testing with ${files.length} files`);
          
          // Get current Jenkins pod name
          const podNameBefore = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod before restart: ${podNameBefore}`);
          
          // Write all files to Jenkins home directory
          for (const file of files) {
            const testFilename = `pbt-multi-test-${file.filename}.txt`;
            await writeDataToJenkinsHome(podNameBefore, testFilename, file.data);
            console.log(`[Property Test] Written file: ${testFilename}`);
          }
          
          // Restart Jenkins controller pod
          console.log(`[Property Test] Restarting Jenkins pod...`);
          await restartJenkinsPod(podNameBefore);
          
          // Get new Jenkins pod name
          const podNameAfter = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod after restart: ${podNameAfter}`);
          
          // Verify all files persist after restart
          for (const file of files) {
            const testFilename = `pbt-multi-test-${file.filename}.txt`;
            const dataAfterRestart = await readDataFromJenkinsHome(podNameAfter, testFilename);
            
            // Property assertion: Each file's data must be unchanged after restart
            expect(dataAfterRestart).toBe(file.data);
            console.log(`[Property Test] ✓ File ${testFilename} persisted`);
          }
          
          // Cleanup: Remove all test files
          for (const file of files) {
            const testFilename = `pbt-multi-test-${file.filename}.txt`;
            await kubectl(`exec ${podNameAfter} -n jenkins -- rm -f /var/jenkins_home/${testFilename}`);
          }
          console.log(`[Property Test] Cleanup completed`);
        }
      ),
      {
        // Run 50 iterations (fewer than single file test due to complexity)
        numRuns: 50,
        // Timeout for each test case (5 minutes to allow for pod restart)
        timeout: 300000,
        // Verbose output for debugging
        verbose: true,
      }
    );
  }, 600000); // 10 minute timeout for entire test suite
});
