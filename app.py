import pandas as pd
import datetime
import os

import streamlit as st
from streamlit_toggle import st_toggle_switch
from st_pages import show_pages_from_config

show_pages_from_config()

# Set Streamlit Configuration
st.set_page_config(layout="wide")

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: visible;
                height: 1%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

CONTINENT_COLORS = {
    'Asia': '#FFE5B4',
    'Africa': '#FF9898',
    'Europe': '#B0C4DE',
    'North America': '#BA9192',
    'South America': '#D8BFD8',
    'Oceania': '#CBE2DA',
}

current_date = datetime.datetime.now().strftime("%Y-%m-%d")

tools_path = './tools'
data_description_path = os.path.join(tools_path, 'data_description')

ttl_duration = 60 * 60 * 24 + 60 * 10  # 24 hours + 10 minutes in seconds


def main():
    add_logo(os.path.join(tools_path, 'logo_base64.txt'))
    # Styling and Layout
    remote_css("https://cdnjs.cloudflare.com/ajax/libs/semantic-ui/2.4.1/semantic.min.css")
    # local_css("./data/remote_style.css")
    local_css(os.path.join(tools_path, 'style.css'))

    # Load the data
    df_download = pd.read_csv('./data/data_for_download.csv')

    with st.container():
        # 筛选能源类型
        selected_energy = st.sidebar.selectbox(
            'Select Energy Type',
            ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'],
            index=0)

        view_details = display_switch_button()

        # 筛选大洲
        continents = ['World', 'Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']

        selected_continent = st.sidebar.selectbox(
            'Select Continents',
            continents,
            index=0)

        table_scorecard = read_html_file(selected_energy, selected_continent, view_details)
        st.markdown(table_scorecard, unsafe_allow_html=True)

        # 使用 Streamlit 的下载按钮进行一键下载
        if selected_energy == 'total':
            csv_data = df_download[df_download['type'] != 'total'].to_csv(index=False)
        else:
            csv_data = df_download[df_download['type'] == selected_energy].to_csv(index=False)

        st.sidebar.download_button(
            label=f"🗃️ Download :red[{selected_energy.title()}] Data as CSV",
            data=csv_data,
            file_name=f"{selected_energy}_data_{current_date}.csv",
            mime="text/csv",
            use_container_width=True,
        )

@st.cache_data(ttl=ttl_duration)
def read_html_file(selected_energy, selected_continent, view_details):
    html_name = os.path.join(data_description_path, f'{selected_energy}_{selected_continent}_{view_details}.html')
    with open(html_name, 'r', encoding='utf-8') as file:
        content = file.read()
    return content


@st.cache_data(ttl=ttl_duration)
def load_base64_file(base64_file):
    with open(base64_file, "r") as f:
        b64_string = f.read()
    return b64_string


def add_logo(base64_file):
    b64_string = load_base64_file(base64_file)

    # Insert the Base64 string into the CSS
    st.markdown(
        f"""
        <style>
            [data-testid="stSidebarNav"] {{
                background-image: url(data:image/png;base64,{b64_string});
                background-repeat: no-repeat;
                background-size: 80% auto;
                padding-top: 40px;
                background-position: 20px 20px;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def local_css(file_name):
    with open(file_name) as f:
        st.markdown(f'<style>{f.read()}</style>', unsafe_allow_html=True)


def remote_css(url):
    st.markdown(f'<link href="{url}" rel="stylesheet">', unsafe_allow_html=True)


def display_switch_button():
    # Initialize state if it doesn't exist
    if 'toggle_switch' not in st.session_state:
        st.session_state['toggle_switch'] = False

    # Use session_state for default_value
    st.session_state['toggle_switch'] = st_toggle_switch(
        label="Show More Details",
        key="switch",
        default_value=st.session_state['toggle_switch'],
        label_after=False,
        inactive_color="#D3D3D3",  # optional
        active_color="#11567f",  # optional
        track_color="#29B5E8",  # optional
    )

    if st.session_state['toggle_switch']:
        view_details = 'none'
    else:
        view_details = 'visible'

    return view_details


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
