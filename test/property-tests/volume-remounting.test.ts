/**
 * Property-Based Test: Persistent Volume Remounting
 * 
 * Feature: jenkins-eks-cluster
 * Property 2: Persistent Volume Remounting
 * 
 * Validates: Requirements 6.10
 * 
 * This test verifies that the EFS persistent volume is correctly remounted
 * when the Jenkins controller pod is deleted and rescheduled. The test:
 * 1. Captures EFS mount information from the current pod
 * 2. Deletes and reschedules the Jenkins controller pod
 * 3. Verifies EFS is remounted to the new pod with correct mount options
 * 
 * This property must hold for all pod rescheduling scenarios.
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

// Interface for EFS mount information
interface EfsMountInfo {
  mountPoint: string;
  fileSystemId: string;
  mountOptions: string[];
  isReadWrite: boolean;
}

// Helper function to get EFS mount information from pod
async function getEfsMountInfo(podName: string): Promise<EfsMountInfo> {
  // Get mount information for /var/jenkins_home
  const mountOutput = await kubectl(`exec ${podName} -n jenkins -- mount | grep /var/jenkins_home`);
  
  // Parse mount output
  // Example: 127.0.0.1:/fs-12345678 on /var/jenkins_home type nfs4 (rw,relatime,...)
  const mountRegex = /^([^:]+):([^\s]+)\s+on\s+([^\s]+)\s+type\s+([^\s]+)\s+\(([^)]+)\)/;
  const match = mountOutput.match(mountRegex);
  
  if (!match) {
    throw new Error(`Failed to parse mount output: ${mountOutput}`);
  }
  
  const [, , fileSystemPath, mountPoint, , optionsStr] = match;
  const mountOptions = optionsStr.split(',');
  
  // Extract file system ID from path (format: /fs-12345678)
  const fileSystemId = fileSystemPath.split('/')[1];
  
  // Check if mount is read-write
  const isReadWrite = mountOptions.includes('rw');
  
  return {
    mountPoint,
    fileSystemId,
    mountOptions,
    isReadWrite,
  };
}

// Helper function to verify EFS mount is functional
async function verifyEfsMountFunctional(podName: string): Promise<boolean> {
  try {
    // Try to write a test file
    const testFilename = `mount-test-${Date.now()}.txt`;
    await kubectl(`exec ${podName} -n jenkins -- sh -c "echo 'test' > /var/jenkins_home/${testFilename}"`);
    
    // Try to read the test file
    const content = await kubectl(`exec ${podName} -n jenkins -- cat /var/jenkins_home/${testFilename}`);
    
    // Clean up test file
    await kubectl(`exec ${podName} -n jenkins -- rm -f /var/jenkins_home/${testFilename}`);
    
    return content === 'test';
  } catch (error) {
    console.error('EFS mount verification failed:', error);
    return false;
  }
}

// Helper function to delete and reschedule Jenkins pod
async function deleteAndReschedulePod(podName: string): Promise<void> {
  // Delete the pod - StatefulSet will recreate it
  await kubectl(`delete pod ${podName} -n jenkins --grace-period=30`);
  
  // Wait for new pod to be ready
  await kubectl('wait --for=condition=ready pod -l app=jenkins-controller -n jenkins --timeout=300s');
  
  // Give Jenkins a moment to fully initialize
  await new Promise(resolve => setTimeout(resolve, 10000));
}

describe('Property Test: Persistent Volume Remounting', () => {
  // Skip if not in integration test environment
  const isIntegrationTest = process.env.RUN_INTEGRATION_TESTS === 'true';
  
  if (!isIntegrationTest) {
    it.skip('Skipping integration test - set RUN_INTEGRATION_TESTS=true to run', () => {});
    return;
  }

  /**
   * Property: EFS persistent volume is correctly remounted after pod rescheduling
   * 
   * For all pod rescheduling scenarios:
   * 
   * When:
   * 1. Jenkins controller pod is deleted
   * 2. StatefulSet reschedules a new pod
   * 
   * Then:
   * - EFS must be remounted to the new pod
   * - File system ID must remain the same
   * - Mount point must be /var/jenkins_home
   * - Mount must be read-write
   * - Mount must be functional (can read/write files)
   */
  it('should remount EFS persistent volume after pod rescheduling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random iteration number (used for logging/tracking)
        fc.integer({ min: 1, max: 100 }),
        async (iteration: number) => {
          console.log(`\n[Property Test] Iteration ${iteration}: Testing EFS remounting`);
          
          // Get current Jenkins pod name
          const podNameBefore = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod before rescheduling: ${podNameBefore}`);
          
          // Capture EFS mount information before rescheduling
          const mountInfoBefore = await getEfsMountInfo(podNameBefore);
          console.log(`[Property Test] EFS mount info before rescheduling:`);
          console.log(`  - Mount point: ${mountInfoBefore.mountPoint}`);
          console.log(`  - File system ID: ${mountInfoBefore.fileSystemId}`);
          console.log(`  - Read-write: ${mountInfoBefore.isReadWrite}`);
          console.log(`  - Mount options: ${mountInfoBefore.mountOptions.join(', ')}`);
          
          // Verify mount is functional before rescheduling
          const isFunctionalBefore = await verifyEfsMountFunctional(podNameBefore);
          expect(isFunctionalBefore).toBe(true);
          console.log(`[Property Test] ✓ EFS mount is functional before rescheduling`);
          
          // Delete and reschedule Jenkins pod
          console.log(`[Property Test] Deleting and rescheduling Jenkins pod...`);
          await deleteAndReschedulePod(podNameBefore);
          
          // Get new Jenkins pod name
          const podNameAfter = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod after rescheduling: ${podNameAfter}`);
          
          // Verify pod name changed (new pod was created)
          expect(podNameAfter).not.toBe(podNameBefore);
          console.log(`[Property Test] ✓ New pod was created`);
          
          // Capture EFS mount information after rescheduling
          const mountInfoAfter = await getEfsMountInfo(podNameAfter);
          console.log(`[Property Test] EFS mount info after rescheduling:`);
          console.log(`  - Mount point: ${mountInfoAfter.mountPoint}`);
          console.log(`  - File system ID: ${mountInfoAfter.fileSystemId}`);
          console.log(`  - Read-write: ${mountInfoAfter.isReadWrite}`);
          console.log(`  - Mount options: ${mountInfoAfter.mountOptions.join(', ')}`);
          
          // Property assertions: EFS must be remounted correctly
          
          // 1. File system ID must remain the same (same EFS)
          expect(mountInfoAfter.fileSystemId).toBe(mountInfoBefore.fileSystemId);
          console.log(`[Property Test] ✓ File system ID unchanged`);
          
          // 2. Mount point must be /var/jenkins_home
          expect(mountInfoAfter.mountPoint).toBe('/var/jenkins_home');
          console.log(`[Property Test] ✓ Mount point is /var/jenkins_home`);
          
          // 3. Mount must be read-write
          expect(mountInfoAfter.isReadWrite).toBe(true);
          console.log(`[Property Test] ✓ Mount is read-write`);
          
          // 4. Mount must be functional (can read/write files)
          const isFunctionalAfter = await verifyEfsMountFunctional(podNameAfter);
          expect(isFunctionalAfter).toBe(true);
          console.log(`[Property Test] ✓ EFS mount is functional after rescheduling`);
          
          console.log(`[Property Test] ✓ EFS persistent volume remounted successfully`);
        }
      ),
      {
        // Run 100 iterations to test various rescheduling scenarios
        numRuns: 100,
        // Timeout for each test case (5 minutes to allow for pod rescheduling)
        timeout: 300000,
        // Verbose output for debugging
        verbose: true,
      }
    );
  }, 600000); // 10 minute timeout for entire test suite

  /**
   * Property: Data persists across EFS remounting
   * 
   * This test verifies that data written before pod rescheduling
   * is still accessible after EFS is remounted to the new pod.
   */
  it('should preserve data across EFS remounting', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random filename and data
        fc.string({ minLength: 8, maxLength: 16, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (filename: string, data: string) => {
          const testFilename = `pbt-remount-test-${filename}.txt`;
          
          console.log(`\n[Property Test] Testing data persistence with filename: ${testFilename}`);
          
          // Get current Jenkins pod name
          const podNameBefore = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod before rescheduling: ${podNameBefore}`);
          
          // Write data to Jenkins home directory
          await kubectl(`exec ${podNameBefore} -n jenkins -- sh -c "echo '${data}' > /var/jenkins_home/${testFilename}"`);
          console.log(`[Property Test] Data written to ${testFilename}`);
          
          // Verify data was written correctly
          const dataBeforeReschedule = await kubectl(`exec ${podNameBefore} -n jenkins -- cat /var/jenkins_home/${testFilename}`);
          expect(dataBeforeReschedule).toBe(data);
          console.log(`[Property Test] Data verified before rescheduling`);
          
          // Delete and reschedule Jenkins pod
          console.log(`[Property Test] Deleting and rescheduling Jenkins pod...`);
          await deleteAndReschedulePod(podNameBefore);
          
          // Get new Jenkins pod name
          const podNameAfter = await getJenkinsPodName();
          console.log(`[Property Test] Jenkins pod after rescheduling: ${podNameAfter}`);
          
          // Verify data persists after remounting
          const dataAfterReschedule = await kubectl(`exec ${podNameAfter} -n jenkins -- cat /var/jenkins_home/${testFilename}`);
          console.log(`[Property Test] Data read after rescheduling`);
          
          // Property assertion: Data must be unchanged after remounting
          expect(dataAfterReschedule).toBe(data);
          console.log(`[Property Test] ✓ Data persisted across EFS remounting`);
          
          // Cleanup: Remove test file
          await kubectl(`exec ${podNameAfter} -n jenkins -- rm -f /var/jenkins_home/${testFilename}`);
          console.log(`[Property Test] Cleanup completed`);
        }
      ),
      {
        // Run 100 iterations to test various data and filename combinations
        numRuns: 100,
        // Timeout for each test case (5 minutes to allow for pod rescheduling)
        timeout: 300000,
        // Verbose output for debugging
        verbose: true,
      }
    );
  }, 600000); // 10 minute timeout for entire test suite
});
