#!/usr/bin/env python

# This is a shim to hopefully allow Github to detect the package, build is done with poetry

import setuptools

if __name__ == "__main__":
    setuptools.setup(
        name="baidupcs-py",
        version="0.7.6",
        packages=["baidupcs_py"],  # 明确指定只包含baidupcs_py包
        package_data={"baidupcs_py": ["*"]},
    )
