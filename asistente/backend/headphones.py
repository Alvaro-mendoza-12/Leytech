"""Accept only connected render endpoints classified as headphones/headsets."""
import re
import comtypes
from pycaw.pycaw import AudioUtilities
from pycaw.constants import CLSID_MMDeviceEnumerator
from pycaw.api.mmdeviceapi import IMMDeviceEnumerator

FORM_FACTOR = '{1DA5D803-D492-4EDD-8C23-E0C0FFEE7F0E} 0'


def is_headphone(device):
    # Windows endpoint form factor: Headphones=3, Headset=5.
    factor = device.properties.get(FORM_FACTOR)
    if factor is not None:
        return factor in (3, 5)
    # Some third-party drivers omit the property; never accept USB/Bluetooth
    # alone, because those labels also describe speakers and standalone mics.
    return bool(re.search(r'headphones?|headset|auricular|earbuds?|earphones?', device.FriendlyName or '', re.I))


def connected_headphones():
    enumerator = comtypes.CoCreateInstance(CLSID_MMDeviceEnumerator, IMMDeviceEnumerator, comtypes.CLSCTX_INPROC_SERVER)
    collection = enumerator.EnumAudioEndpoints(0, 1)  # eRender, DEVICE_STATE_ACTIVE
    names = []
    for index in range(collection.GetCount()):
        device = AudioUtilities.CreateDevice(collection.Item(index))
        if device is not None and is_headphone(device):
            names.append(device.FriendlyName)
    return names
